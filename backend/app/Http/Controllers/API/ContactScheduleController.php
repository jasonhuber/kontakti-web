<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ContactScheduleItem;
use App\Services\ContactScheduleBuilder;
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
            ->with(['person:id,first_name,last_name,email,phone,avatar_url,company_id,last_contacted_at,relationship_strength,do_not_contact', 'person.company:id,name'])
            ->orderBy('due_at')
            ->get()
            // One suggestion per person (earliest due wins), skip do-not-contact / deleted.
            ->filter(fn($i) => $i->person && !$i->person->do_not_contact)
            ->unique('person_id')
            ->take($limit)
            ->values();

        $suggestions = $items->map(function ($i) {
            $p = $i->person;
            $channel = $p->phone ? 'text or call' : ($p->email ? 'email' : 'reach out');
            $last = $p->last_contacted_at ? $p->last_contacted_at->diffForHumans() : 'no record of contact';
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
            ];
        });

        return response()->json([
            'count'       => $suggestions->count(),
            'suggestions' => $suggestions,
        ]);
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
