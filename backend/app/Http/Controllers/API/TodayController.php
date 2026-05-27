<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, ReachOutLog, SocialActivity};
use App\Services\{ContactQuizService, MessageDrafter, TodayInbox};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\Cache;

class TodayController extends Controller
{
    public function __construct(
        private TodayInbox $inbox,
        private ContactQuizService $quiz,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $limit = (int) $request->query('limit', 10);
        $limit = max(1, min(50, $limit));

        $user = auth()->user();
        $items = $this->inbox->forUser($user, $limit);

        // Snapshot the items for follow-up resolution by item id.
        $this->snapshot(auth()->id(), $items);

        // Daily contact quiz (5 prompts) — separate channel from reach-out items.
        $prompts = $this->quiz->generateDailyQuiz($user)->map(function ($p) {
            $person = $p->person;
            // Skip prompts whose person was deleted (e.g. after a contact wipe).
            if (!$person) return null;
            $suggestions = ContactQuizService::QUESTIONS[$p->question_key]['responses'] ?? [];
            return [
                'id'                  => $p->id,
                'person'              => $person,
                'question_key'        => $p->question_key,
                'question_text'       => $p->question_text,
                'suggested_responses' => $suggestions,
                'shown_at'            => $p->shown_at?->toIso8601String(),
                'answered_at'         => $p->answered_at?->toIso8601String(),
            ];
        })->filter()->values();

        return response()->json([
            'items'            => $items,
            'count'            => count($items),
            'quiz'             => $prompts,
            'rhythm_insights'  => $this->inbox->rhythmInsights($user, 3),
        ]);
    }

    public function draft(Request $request, string $key, MessageDrafter $drafter): JsonResponse
    {
        $items = $this->loadSnapshot(auth()->id());
        $item = collect($items)->firstWhere('id', $key);
        if (!$item) {
            return response()->json(['message' => 'Item not found or expired. Refresh /today.'], 404);
        }

        $person = Person::where('user_id', auth()->id())->find($item['person']['id'] ?? null);
        if (!$person) {
            return response()->json(['message' => 'Person not found.'], 404);
        }

        $signal = null;
        $activityId = $item['signal']['activity_id'] ?? null;
        if ($activityId) {
            $signal = SocialActivity::where('user_id', auth()->id())->find($activityId);
        }

        try {
            $draft = $drafter->draft($person, $item['kind'], $signal);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['draft' => $draft]);
    }

    public function log(Request $request, string $key): JsonResponse
    {
        $data = $request->validate([
            'via'  => 'required|in:email,phone,sms,imessage,whatsapp,instagram,facebook,in_person,other',
            'note' => 'nullable|string|max:2000',
        ]);

        $items = $this->loadSnapshot(auth()->id());
        $item = collect($items)->firstWhere('id', $key);
        if (!$item) {
            return response()->json(['message' => 'Item not found or expired. Refresh /today.'], 404);
        }

        $person = Person::where('user_id', auth()->id())->find($item['person']['id'] ?? null);
        if (!$person) {
            return response()->json(['message' => 'Person not found.'], 404);
        }

        $reason = match ($item['kind']) {
            'birthday'        => 'birthday',
            'rhythm_broken'   => 'cadence',
            'cadence_overdue' => 'cadence',
            'follow_up_due'   => 'follow_up',
            'job_change'      => 'job_change',
            'social_signal'   => 'social_signal',
            'anniversary_met' => 'manual',
            default           => 'manual',
        };

        $log = ReachOutLog::create([
            'user_id'   => auth()->id(),
            'person_id' => $person->id,
            'via'       => $data['via'],
            'reason'    => $reason,
            'note'      => $data['note'] ?? null,
        ]);

        // Always update last_contacted_at when any outreach is logged.
        // The DB trigger only fires for reason='follow_up'; other reasons
        // (birthday, cadence, social_signal, etc.) would leave last_contacted_at
        // stale, causing the same people to reappear in Today immediately after
        // logging them.
        $person->update(['last_contacted_at' => now()]);
        $person->refresh();

        // Acknowledge the underlying social activity (if any) so it doesn't reappear.
        $activityId = $item['signal']['activity_id'] ?? null;
        if ($activityId) {
            SocialActivity::where('user_id', auth()->id())
                ->where('id', $activityId)
                ->update(['acknowledged_at' => now()]);
        }

        return response()->json([
            'reach_out_log_id'  => $log->id,
            'last_contacted_at' => $person->last_contacted_at?->toIso8601String(),
            'next_followup_at'  => $person->next_followup_at?->toIso8601String(),
        ], 201);
    }

    private function cacheKey(int $userId): string
    {
        return "today_inbox:user:{$userId}";
    }

    private function snapshot(int $userId, array $items): void
    {
        // Cache for 30 minutes — long enough to handle a draft+log click,
        // short enough that stale UI re-fetches see fresh data.
        Cache::put($this->cacheKey($userId), $items, now()->addMinutes(30));
    }

    private function loadSnapshot(int $userId): array
    {
        $cached = Cache::get($this->cacheKey($userId));
        if (is_array($cached)) {
            return $cached;
        }
        // Rebuild on the fly so draft/log are resilient even after cache eviction.
        $items = $this->inbox->forUser(auth()->user(), 50);
        $this->snapshot($userId, $items);
        return $items;
    }
}
