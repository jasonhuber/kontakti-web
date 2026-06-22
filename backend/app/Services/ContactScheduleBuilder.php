<?php

namespace App\Services;

use App\Models\{ContactScheduleItem, Person, User};
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Builds the precomputed, queryable contact timeline ("when should I reach out
 * to each person") deterministically, up to a horizon (default 6 months).
 *
 * Deterministic on purpose: cadence intervals, birthdays, and holidays are
 * predictable, so we materialize them into the `contact_schedule` table once a
 * day rather than recomputing on every query. An LLM layer (see
 * ContactScheduleController::suggestions) sits on top for prioritization/phrasing
 * — it never decides the dates.
 *
 * Idempotent: re-running upserts the same rows (unique on person/reason/due_at)
 * and prunes stale future 'pending' rows that no longer apply (e.g. cadence
 * changed). Past rows and user-touched rows (done/snoozed/dismissed) are left
 * alone so history and decisions survive.
 */
class ContactScheduleBuilder
{
    public const HORIZON_MONTHS = 6;

    /** Cadence preset → interval length in days. */
    private const CADENCE_DAYS = [
        'monthly'   => 30,
        'quarterly' => 91,
        'biannual'  => 182,
        'annual'    => 365,
    ];

    public function rebuildForUser(User $user, ?Carbon $now = null): int
    {
        $now     = $now ? $now->copy() : now();
        $horizon = $now->copy()->addMonths(self::HORIZON_MONTHS);
        $written = 0;

        // Collect the (person_id, reason, due_at) rows we intend to exist so we can
        // prune obsolete future pending rows afterward.
        $intended = [];

        $people = $user->people()
            ->where('do_not_contact', false)
            ->get(['id', 'first_name', 'last_name', 'contact_cadence', 'contact_on_birthday',
                   'contact_on_holidays', 'birthday', 'last_contacted_at']);

        foreach ($people as $person) {
            // If the user has already reached out at/after a pending item's due date,
            // consider it satisfied so it stops showing as overdue.
            if ($person->last_contacted_at) {
                ContactScheduleItem::where('person_id', $person->id)
                    ->where('status', 'pending')
                    ->whereDate('due_at', '<=', Carbon::parse($person->last_contacted_at)->toDateString())
                    ->update(['status' => 'done']);
            }

            foreach ($this->datesForPerson($person, $now, $horizon) as [$reason, $dueAt, $label]) {
                $this->upsert($user->id, $person->id, $reason, $dueAt, $label);
                $intended[] = "{$person->id}|{$reason}|{$dueAt->toDateString()}";
                $written++;
            }
        }

        $this->pruneObsolete($user->id, $now, $intended);

        return $written;
    }

    /** @return array<array{0:string,1:Carbon,2:?string}> [reason, due_at, label] */
    private function datesForPerson(Person $person, Carbon $now, Carbon $horizon): array
    {
        $out = [];

        // 1) Cadence interval — the next due date is (last contact OR now) + interval.
        //    We deliberately do NOT roll a past-due date forward: if someone is
        //    overdue, the due date stays in the past so they surface as overdue in
        //    "who should I reach out to". Once contacted, last_contacted_at advances
        //    and the next rebuild recomputes (and auto-completes the satisfied row).
        //    A brand-new contact (no last_contacted_at) gets its first check-in
        //    staggered deterministically across the cadence window, so a fresh
        //    import becomes a steady daily reconnect stream instead of one giant
        //    wave landing on a single day. Once contacted, it re-anchors normally.
        if ($person->contact_cadence && $person->contact_cadence !== 'none') {
            $days = self::CADENCE_DAYS[$person->contact_cadence] ?? null;
            if ($days) {
                if ($person->last_contacted_at) {
                    $next = Carbon::parse($person->last_contacted_at)->startOfDay()->addDays($days);
                } else {
                    $offset = (int) (abs(crc32($person->id)) % $days);
                    $next = $now->copy()->startOfDay()->addDays($offset);
                }
                // Record overdue (past) and near-future dates; skip far-future
                // (> horizon) — those get recorded once they enter the 6-month window.
                if ($next->lte($horizon)) {
                    $out[] = ['cadence', $next, $this->cadenceLabel($person->contact_cadence)];
                }
            }
        }

        // 2) Birthday — next birthday within horizon (only if we know it).
        if ($person->contact_on_birthday && $person->birthday) {
            $bday = $this->nextAnnual(Carbon::parse($person->birthday), $now);
            if ($bday && $bday->lte($horizon)) {
                $out[] = ['birthday', $bday, 'Birthday'];
            }
        }

        // 3) Holidays — fixed list, next occurrence(s) within horizon.
        if ($person->contact_on_holidays) {
            foreach ($this->upcomingHolidays($now, $horizon) as [$date, $name]) {
                $out[] = ['holiday', $date, $name];
            }
        }

        return $out;
    }

    private function cadenceLabel(string $cadence): string
    {
        return match ($cadence) {
            'monthly'   => 'Monthly check-in',
            'quarterly' => 'Quarterly check-in',
            'biannual'  => 'Twice-a-year check-in',
            'annual'    => 'Yearly check-in',
            default     => 'Check-in',
        };
    }

    /** Next occurrence of an annual month/day on or after $now. */
    private function nextAnnual(Carbon $date, Carbon $now): ?Carbon
    {
        $candidate = Carbon::create($now->year, $date->month, $date->day, 0, 0, 0, $now->timezone);
        if (!$candidate) return null;
        if ($candidate->lt($now->copy()->startOfDay())) {
            $candidate = Carbon::create($now->year + 1, $date->month, $date->day, 0, 0, 0, $now->timezone);
        }
        return $candidate;
    }

    /** @return array<array{0:Carbon,1:string}> upcoming [date, name] within window */
    private function upcomingHolidays(Carbon $now, Carbon $horizon): array
    {
        $candidates = [];
        // Span this year and next so a horizon crossing year-end still resolves.
        foreach ([$now->year, $now->year + 1] as $y) {
            $candidates[] = [Carbon::create($y, 1, 1),   "New Year's"];
            $candidates[] = [Carbon::create($y, 7, 4),   'Independence Day'];
            $candidates[] = [$this->nthWeekdayOfMonth($y, 11, Carbon::THURSDAY, 4), 'Thanksgiving'];
            $candidates[] = [Carbon::create($y, 12, 25),  'Christmas'];
        }

        $out = [];
        foreach ($candidates as [$date, $name]) {
            if ($date && $date->gte($now->copy()->startOfDay()) && $date->lte($horizon)) {
                $out[] = [$date, $name];
            }
        }
        return $out;
    }

    private function nthWeekdayOfMonth(int $year, int $month, int $weekday, int $n): Carbon
    {
        $d = Carbon::create($year, $month, 1);
        $count = 0;
        while (true) {
            if ($d->dayOfWeek === $weekday) {
                $count++;
                if ($count === $n) return $d;
            }
            $d->addDay();
        }
    }

    private function upsert(int $userId, string $personId, string $reason, Carbon $dueAt, ?string $label): void
    {
        // Match on person/reason/date; set user_id + label. `status` is intentionally
        // omitted: new rows get the DB default 'pending', and existing rows keep
        // whatever the user already set (done/snoozed/dismissed) — never resurrected.
        ContactScheduleItem::updateOrCreate(
            ['person_id' => $personId, 'reason' => $reason, 'due_at' => $dueAt->toDateString()],
            ['user_id' => $userId, 'label' => $label]
        );
    }

    /**
     * Remove future 'pending' rows we no longer intend (cadence changed, birthday
     * cleared, etc.). Never touches past rows or user-decided rows.
     */
    private function pruneObsolete(int $userId, Carbon $now, array $intended): void
    {
        $rows = ContactScheduleItem::where('user_id', $userId)
            ->where('status', 'pending')
            ->where('due_at', '>=', $now->toDateString())
            ->get(['id', 'person_id', 'reason', 'due_at']);

        $keep = array_flip($intended);
        $toDelete = [];
        foreach ($rows as $r) {
            $key = "{$r->person_id}|{$r->reason}|" . $r->due_at->toDateString();
            if (!isset($keep[$key])) {
                $toDelete[] = $r->id;
            }
        }
        if ($toDelete) {
            ContactScheduleItem::whereIn('id', $toDelete)->delete();
        }
    }
}
