<?php

namespace App\Services;

use App\Models\{Person, SocialActivity, User};
use Carbon\Carbon;
use Illuminate\Support\Collection;

class TodayInbox
{
    public function __construct(private ?RelationshipRhythm $rhythm = null)
    {
        $this->rhythm ??= app(RelationshipRhythm::class);
    }


    /**
     * Cadence rules (days between expected outreach) keyed by relationship_strength.
     */
    public const CADENCE_DAYS = [
        'close' => 30,
        'hot'   => 90,
        'warm'  => 180,
        'cold'  => 365,
    ];

    /**
     * Birthday lookahead window (today plus N days).
     */
    public const BIRTHDAY_LOOKAHEAD_DAYS = 7;

    /**
     * Social signal lookback window (days).
     */
    public const SOCIAL_SIGNAL_LOOKBACK_DAYS = 14;

    /**
     * Priority weights for social signals by relationship strength.
     */
    public const SOCIAL_SIGNAL_PRIORITY = [
        'close' => 0.7,
        'hot'   => 0.5,
        'warm'  => 0.3,
        'cold'  => 0.1,
    ];

    public function forUser(User $user, int $limit = 10): array
    {
        $now = Carbon::now();

        $people = $user->people()
            ->with(['company:id,name', 'emails', 'phones'])
            ->where('do_not_contact', false)
            ->get()
            // Suppress people the user told us they don't recognize.
            ->reject(fn (Person $p) => ($p->metadata['recognize'] ?? null) === 'no')
            ->values();

        $candidatesByPerson = [];

        // 1) Birthdays — today through +7d
        foreach ($people as $person) {
            $bday = $person->birthday;
            if (!$bday) continue;
            $thisYear = Carbon::create($now->year, $bday->month, $bday->day);
            // If already passed this year, slide to next year's birthday so we catch
            // people born in Dec when "today" is early Jan.
            if ($thisYear->lt($now->copy()->startOfDay())) {
                $thisYear = $thisYear->copy()->addYear();
            }
            $daysUntil = (int) $now->copy()->startOfDay()->diffInDays($thisYear->copy()->startOfDay(), false);
            if ($daysUntil < 0 || $daysUntil > self::BIRTHDAY_LOOKAHEAD_DAYS) continue;

            // Priority slides from 1.0 (today) to 0.7 (day +7)
            $priority = 1.0 - (0.3 * ($daysUntil / self::BIRTHDAY_LOOKAHEAD_DAYS));
            $reason = $daysUntil === 0
                ? 'Birthday today'
                : ($daysUntil === 1 ? 'Birthday tomorrow' : "Birthday in {$daysUntil} days");

            $this->offer($candidatesByPerson, $person, [
                'id'       => "birthday:{$person->id}",
                'kind'     => 'birthday',
                'reason'   => $reason,
                'priority' => $priority,
                'signal'   => ['type' => 'birthday', 'date' => $thisYear->toDateString()],
            ]);
        }

        // 2) Cadence — rhythm-based for people with enough history,
        //    fallback to flat strength→days map for sparse-history contacts.
        foreach ($people as $person) {
            $snapshot = $this->rhythm->forPerson($person);

            // Rhythm-based path: requires >= 3 interactions.
            if ($snapshot->interactionCount >= 3 && $snapshot->meanIntervalDays) {
                $score = $this->rhythm->breakingPoint($person);
                if ($score === null || $score < 0.4) continue; // not breaking yet

                $reason = match ($snapshot->state) {
                    'broken' => sprintf(
                        'You used to talk %s. It\'s been %s.',
                        strtolower($this->cadenceWordFromDays((float) $snapshot->meanIntervalDays)),
                        $snapshot->lastInteractionAt?->diffForHumans(null, true) ?? 'a while'
                    ),
                    'stretching' => sprintf(
                        '%s cadence — last chatted %s.',
                        ucfirst($this->cadenceWordFromDays((float) $snapshot->meanIntervalDays)),
                        $snapshot->lastInteractionAt?->diffForHumans() ?? 'a while ago'
                    ),
                    default => 'Reach out to keep this rhythm going.',
                };

                $this->offer($candidatesByPerson, $person, [
                    'id'       => "rhythm:{$person->id}",
                    'kind'     => 'rhythm_broken',
                    'reason'   => $reason,
                    'priority' => $score,
                    'signal'   => [
                        'type'   => 'rhythm',
                        'rhythm' => $snapshot->toArray(),
                    ],
                ]);
                continue;
            }

            // Fallback: legacy flat cadence for sparse-history people.
            if (!$person->last_contacted_at) continue;
            $strength = $person->relationship_strength ?? 'cold';
            $cadence = self::CADENCE_DAYS[$strength] ?? self::CADENCE_DAYS['cold'];
            $due = $person->last_contacted_at->copy()->addDays($cadence);
            if ($due->gt($now)) continue;

            $daysOverdue = (int) $due->diffInDays($now);
            $ratio = min(0.95, $daysOverdue / max(1, $cadence));
            $priority = max(0.1, $ratio);

            $lastWhen = $person->last_contacted_at->diffForHumans(null, true);
            $this->offer($candidatesByPerson, $person, [
                'id'       => "cadence:{$person->id}",
                'kind'     => 'cadence_overdue',
                'reason'   => "Haven't talked in {$lastWhen}",
                'priority' => $priority,
                'signal'   => [
                    'type'              => 'cadence',
                    'cadence_days'      => $cadence,
                    'last_contacted_at' => $person->last_contacted_at->toIso8601String(),
                ],
            ]);
        }

        // 3) Follow-ups due (next_followup_at)
        foreach ($people as $person) {
            if (!$person->next_followup_at) continue;
            $delta = $now->diffInDays($person->next_followup_at, false);
            if ($delta > 3) continue; // not soon enough
            $priority = $delta <= 0 ? 0.9 : 0.5;
            $reason = $delta <= 0
                ? 'Follow-up due'
                : "Follow-up due in {$delta} days";
            $this->offer($candidatesByPerson, $person, [
                'id'       => "follow_up:{$person->id}",
                'kind'     => 'follow_up_due',
                'reason'   => $reason,
                'priority' => $priority,
                'signal'   => [
                    'type'             => 'follow_up',
                    'next_followup_at' => $person->next_followup_at->toIso8601String(),
                ],
            ]);
        }

        // 4) Job changes — unacknowledged
        $jobChanges = SocialActivity::where('user_id', $user->id)
            ->where('kind', 'job_change')
            ->whereNull('acknowledged_at')
            ->orderByDesc('occurred_at')
            ->get()
            ->keyBy('person_id');

        foreach ($jobChanges as $personId => $activity) {
            $person = $people->firstWhere('id', $personId);
            if (!$person) continue;
            $this->offer($candidatesByPerson, $person, [
                'id'       => "job_change:{$person->id}",
                'kind'     => 'job_change',
                'reason'   => $activity->content ?: 'New role detected',
                'priority' => 0.85,
                'signal'   => [
                    'type'        => 'social_activity',
                    'activity_id' => $activity->id,
                    'source'      => $activity->source,
                ],
            ]);
        }

        // 5) Social signals — posts/life events/check_ins in the last 14d
        $cutoff = $now->copy()->subDays(self::SOCIAL_SIGNAL_LOOKBACK_DAYS);
        $signals = SocialActivity::where('user_id', $user->id)
            ->whereIn('kind', ['post', 'life_event', 'check_in'])
            ->where('occurred_at', '>=', $cutoff)
            ->whereNull('acknowledged_at')
            ->orderByDesc('occurred_at')
            ->get();

        $seenSignalPerson = [];
        foreach ($signals as $activity) {
            if (isset($seenSignalPerson[$activity->person_id])) continue;
            $seenSignalPerson[$activity->person_id] = true;
            $person = $people->firstWhere('id', $activity->person_id);
            if (!$person) continue;
            $strength = $person->relationship_strength ?? 'cold';
            $priority = self::SOCIAL_SIGNAL_PRIORITY[$strength] ?? 0.1;

            $reason = match ($activity->kind) {
                'life_event' => $activity->content ?: 'Shared a life event',
                'check_in'   => $activity->location ? "Checked in at {$activity->location}" : 'New check-in',
                default      => $activity->content ? 'Posted: ' . \Illuminate\Support\Str::limit($activity->content, 80) : 'New post',
            };

            $this->offer($candidatesByPerson, $person, [
                'id'       => "social_signal:{$person->id}",
                'kind'     => 'social_signal',
                'reason'   => $reason,
                'priority' => $priority,
                'signal'   => [
                    'type'        => 'social_activity',
                    'activity_id' => $activity->id,
                    'source'      => $activity->source,
                    'kind'        => $activity->kind,
                ],
            ]);
        }

        // Dedupe + sort + limit
        $items = collect(array_values($candidatesByPerson))
            ->sortByDesc('priority')
            ->values()
            ->take($limit)
            ->all();

        // Hydrate with the full person object and a `created_at` marker
        return array_map(function ($item) use ($people) {
            $person = $people->firstWhere('id', $item['_person_id']);
            unset($item['_person_id']);
            $item['person'] = $person;
            $item['suggested_message'] = null;
            $item['created_at'] = now()->toIso8601String();
            return $item;
        }, $items);
    }

    /**
     * Top broken/stretching rhythms surfaced for the "rhythm insights" panel.
     * Returns up to N rows independent of the main inbox ranking.
     */
    public function rhythmInsights(User $user, int $limit = 3): array
    {
        $insights = [];
        foreach ($user->people()->with('company:id,name')->where('do_not_contact', false)->get() as $person) {
            if (($person->metadata['recognize'] ?? null) === 'no') continue;
            $snap = $this->rhythm->forPerson($person);
            if (!in_array($snap->state, ['broken', 'stretching'], true)) continue;
            $score = $this->rhythm->breakingPoint($person);
            if ($score === null) continue;
            $insights[] = [
                'person_id' => $person->id,
                'person'    => $person,
                'rhythm'    => $snap->toArray(),
                'message'   => $snap->state === 'broken'
                    ? "{$snap->rhythmLabel} — overdue."
                    : "{$snap->rhythmLabel} — stretching.",
                'priority'  => $score,
            ];
        }
        usort($insights, fn ($a, $b) => $b['priority'] <=> $a['priority']);
        return array_slice($insights, 0, $limit);
    }

    private function cadenceWordFromDays(float $days): string
    {
        if ($days < 3)   return 'every couple of days';
        if ($days < 9)   return 'weekly';
        if ($days < 18)  return 'every couple of weeks';
        if ($days < 40)  return 'monthly';
        if ($days < 75)  return 'every ~6 weeks';
        if ($days < 130) return 'quarterly';
        if ($days < 220) return 'twice a year';
        if ($days < 400) return 'yearly';
        return 'rarely';
    }

    /**
     * Keep the highest-priority candidate per person.
     */
    private function offer(array &$bucket, Person $person, array $candidate): void
    {
        $candidate['_person_id'] = $person->id;
        $existing = $bucket[$person->id] ?? null;
        if (!$existing || $candidate['priority'] > $existing['priority']) {
            $bucket[$person->id] = $candidate;
        }
    }
}
