<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{DuplicateCandidate, Person};
use App\Services\DuplicateDetector;
use Illuminate\Http\{Request, JsonResponse};

class DuplicatesController extends Controller
{
    public function __construct(private DuplicateDetector $detector) {}

    public function index(Request $request): JsonResponse
    {
        $userId  = auth()->id();
        $status  = $request->query('status', 'pending');
        $perPage = min((int) $request->query('per_page', 50), 100);
        $page    = max(1, (int) $request->query('page', 1));

        // Sweep orphans before counting/paging — candidates where fewer than 2
        // referenced people still exist (the rest were soft-deleted by an
        // earlier merge). Leaving them pending shows "0 contacts" cards that
        // the user can't actually act on.
        if ($status === 'pending') {
            $this->detector->cleanupOrphans($userId);
        }

        $query = DuplicateCandidate::where('user_id', $userId)
            ->when($status, fn($q) => $q->where('status', $status))
            ->orderByRaw('ISNULL(ai_confidence) ASC, ai_confidence DESC')
            ->orderByDesc('created_at');

        $total  = $query->count();
        $rows   = $query->offset(($page - 1) * $perPage)->limit($perPage)->get();

        // Batch-load all people for all candidates in ONE query (avoids N+1).
        $allPersonIds = $rows->flatMap(fn($r) => $r->person_ids ?? [])->unique()->values()->all();

        $peopleById = collect();
        if (!empty($allPersonIds)) {
            $peopleById = Person::whereIn('id', $allPersonIds)
                ->where('user_id', $userId)
                ->with('company:id,name')
                ->get()
                ->keyBy('id');
        }

        $payload = $rows->map(function (DuplicateCandidate $row) use ($peopleById) {
            $arr = $row->toArray();
            $arr['people'] = collect($row->person_ids ?? [])
                ->map(fn($id) => $peopleById->get($id))
                ->filter()
                ->values();
            return $arr;
        });

        return response()->json([
            'data'         => $payload,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / $perPage),
        ]);
    }

    public function scan(): JsonResponse
    {
        $user = auth()->user();
        $candidates = $this->detector->generateCandidates($user, null);

        // Local auto-score pass: covers BOTH freshly-generated candidates and
        // any older pending ones that still have ai_decision = NULL (e.g.
        // because a previous AI proxy call timed out or wasn't configured).
        $allPending = DuplicateCandidate::where('user_id', $user->id)
            ->where('status', 'pending')
            ->whereNull('ai_decision')
            ->get();
        if ($allPending->isNotEmpty()) {
            $this->detector->autoScoreIdentical($allPending);
        }

        if ($candidates->isNotEmpty()) {
            $this->detector->resolveWithAI($candidates);
        }

        // Re-pull to see how many ended up with an AI decision.
        $aiResolved = 0;
        if ($candidates->isNotEmpty()) {
            $aiResolved = DuplicateCandidate::whereIn('id', $candidates->pluck('id'))
                ->whereNotNull('ai_decision')
                ->count();
        }

        return response()->json([
            'generated'   => $candidates->count(),
            'ai_resolved' => $aiResolved,
        ]);
    }

    public function merge(DuplicateCandidate $duplicate_candidate, Request $request): JsonResponse
    {
        abort_if($duplicate_candidate->user_id !== auth()->id(), 403);

        $data = $request->validate([
            'primary_id' => 'required|string',
            'merged'     => 'required|array',
        ]);

        if (!in_array($data['primary_id'], $duplicate_candidate->person_ids ?? [], true)) {
            return response()->json([
                'message' => 'primary_id must be one of the candidate group members.',
            ], 422);
        }

        $primary = $this->detector->mergeCandidate(
            $duplicate_candidate,
            $data['primary_id'],
            $data['merged']
        );

        return response()->json($primary->load('company'));
    }

    /**
     * Bulk-merge all pending duplicate groups whose contacts share a phone or
     * email (auto-scored as "merge" by the detector). These are guaranteed
     * duplicates that require no human judgment.
     */
    public function mergeIdentical(): JsonResponse
    {
        $userId = auth()->id();

        $rows = DuplicateCandidate::where('user_id', $userId)
            ->where('status', 'pending')
            ->get();

        // Make sure every candidate has been auto-scored before we try to merge.
        // Older candidates may have ai_decision = NULL.
        $this->detector->autoScoreIdentical($rows);
        $rows = DuplicateCandidate::whereIn('id', $rows->pluck('id'))
            ->where('status', 'pending')
            ->get();

        $merged = $this->detector->mergeAutoScored($rows);

        return response()->json(['merged' => $merged]);
    }

    public function dismiss(DuplicateCandidate $duplicate_candidate, Request $request): JsonResponse
    {
        abort_if($duplicate_candidate->user_id !== auth()->id(), 403);

        $reason = $request->input('reason', 'kept_separate');
        $this->detector->dismissCandidate($duplicate_candidate, $reason);

        return response()->json(['status' => $duplicate_candidate->status]);
    }
}
