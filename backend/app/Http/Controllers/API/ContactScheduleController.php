<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ContactScheduleItem;
use App\Services\{ContactScheduleBuilder, MessageDrafter};
use Illuminate\Http\{Request, JsonResponse};

/**
 * Reads and manages the precomputed contact timeline. All queries are scoped to
 * auth()->user() — the schedule is per-user and never shared across tenants.
 */
class ContactScheduleController extends Controller
{
    /**
     * The queryable repository: upcoming reach-outs in date order.
     * ?window=days (default 180), ?status=pending|done|... , ?reason=cadence|birthday|holiday
     */
    public function index(Request $request): JsonResponse
    {
        $windowDays = min((int) $request->get('window', 180), 366);
        $status     = $request->get('status', 'pending');
        $through    = now()->addDays($windowDays)->toDateString();

        $query = ContactScheduleItem::where('user_id', auth()->id())
            ->with(['person:id,first_name,last_name,email,phone,avatar_url,company_id,last_contacted_at,relationship_strength', 'person.company:id,name'])
            ->where('due_at', '<=', $through)
            ->orderBy('due_at');

        if ($status !== 'all') {
            $query->where('status', $status);
        }
        if ($reason = $request->get('reason')) {
            $query->where('reason', $reason);
        }

        return response()->json($query->paginate(100));
    }

    /**
     * "I'm in the mood to reach out" — a small ranked set of people who are due
     * now (or overdue), each with a contact channel hint. Reads the precomputed
     * timeline; never computes dates on the fly.
     */
    public function suggestions(Request $request): JsonResponse
    {
        $limit = min((int) $request->get('limit', 5), 25);

        $items = ContactScheduleItem::where('user_id', auth()->id())
            ->due()
            ->with(['person:id,first_name,last_name,email,phone,whatsapp_phone,instagram_handle,facebook_url,avatar_url,company_id,last_contacted_at,relationship_strength,do_not_contact', 'person.company:id,name'])
            ->orderBy('due_at')
            ->get()
            // One suggestion per person (earliest due wins), skip do-not-contact / deleted.
            ->filter(fn($i) => $i->person && !$i->person->do_not_contact)
            ->unique('person_id')
            ->take($limit)
            ->values();

        $cadenceLabels = ['monthly' => 'monthly', 'quarterly' => 'every 3 months', 'biannual' => 'twice a year', 'annual' => 'once a year'];
        $cadenceDays   = ['monthly' => 30, 'quarterly' => 90, 'biannual' => 182, 'annual' => 365];

        $suggestions = $items->map(function ($i) use ($cadenceLabels, $cadenceDays) {
            $p = $i->person;
            $channel = $p->phone ? 'text or call' : ($p->email ? 'email' : 'reach out');
            $last = $p->last_contacted_at ? $p->last_contacted_at->diffForHumans() : 'no record of contact';

            $daysSince = $p->last_contacted_at ? (int) now()->diffInDays($p->last_contacted_at) : null;
            $target    = $cadenceDays[$p->contact_cadence] ?? null;
            $overdueDays = ($daysSince !== null && $target !== null && $daysSince > $target) ? ($daysSince - $target) : null;

            $why = match($i->reason) {
                'birthday' => "It's {$p->first_name}'s birthday — a great day to reach out.",
                'holiday'  => $i->label ? "{$i->label} — a good moment to check in." : 'Holiday — a good moment to check in.',
                default    => $p->last_contacted_at
                    ? ($overdueDays
                        ? "You usually connect {$cadenceLabels[$p->contact_cadence]}. It's been {$daysSince} days — " . ($overdueDays) . " days past your target."
                        : "Last contact was {$last}.")
                    : "You've never logged a contact with {$p->first_name}.",
            };

            return [
                'schedule_id'  => $i->id,
                'person_id'    => $p->id,
                'name'         => $p->full_name,
                'reason'       => $i->reason,
                'label'        => $i->label,
                'due_at'       => $i->due_at->toDateString(),
                'company'      => $p->company?->name,
                'channel_hint' => $channel,
                'last_contact' => $last,
                'days_since'   => $daysSince,
                'overdue_days' => $overdueDays,
                'why'          => $why,
                'person_first_name' => $p->first_name,
                'person_email'      => $p->email,
                'person_phone'      => $p->phone,
                'person_whatsapp'   => $p->whatsapp_phone,
                'person_instagram'  => $p->instagram_handle,
                'person_facebook'   => $p->facebook_url,
            ];
        });

        return response()->json([
            'count'       => $suggestions->count(),
            'suggestions' => $suggestions,
        ]);
    }

    public function draft(ContactScheduleItem $item, MessageDrafter $drafter): JsonResponse
    {
        $this->authorizeItem($item);

        $person = $item->person;
        if (!$person) {
            return response()->json(['message' => 'Person not found.'], 404);
        }

        $kind = match($item->reason) {
            'birthday' => 'birthday',
            default    => 'cadence_overdue',
        };

        try {
            $draft = $drafter->draft($person, $kind, null);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['draft' => $draft]);
    }

    public function complete(ContactScheduleItem $item): JsonResponse
    {
        $this->authorizeItem($item);
        $item->update(['status' => 'done']);
        return response()->json($item);
    }

    public function snooze(Request $request, ContactScheduleItem $item): JsonResponse
    {
        $this->authorizeItem($item);
        $days = max(1, min((int) $request->get('days', 7), 180));
        $item->update(['status' => 'snoozed', 'snoozed_until' => now()->addDays($days)->toDateString()]);
        return response()->json($item);
    }

    public function dismiss(ContactScheduleItem $item): JsonResponse
    {
        $this->authorizeItem($item);
        $item->update(['status' => 'dismissed']);
        return response()->json($item);
    }

    /** Force an immediate rebuild for the current user (e.g. right after editing cadence). */
    public function rebuild(ContactScheduleBuilder $builder): JsonResponse
    {
        $count = $builder->rebuildForUser(auth()->user());
        return response()->json(['rebuilt' => true, 'scheduled_items' => $count]);
    }

    private function authorizeItem(ContactScheduleItem $item): void
    {
        abort_if($item->user_id !== auth()->id(), 403);
    }
}
