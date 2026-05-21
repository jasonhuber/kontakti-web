<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Discussion, Person, ActivityFeedItem};
use Illuminate\Http\{Request, JsonResponse};

class DiscussionsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Discussion::with(['participants', 'deal'])
            ->orderByDesc('date');

        if ($search = $request->get('q')) {
            $query->search($search);
        }

        if ($dealId = $request->get('deal_id')) {
            $query->where('deal_id', $dealId);
        }

        if ($type = $request->get('type')) {
            $query->where('type', $type);
        }

        return response()->json($query->paginate(50));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'            => 'required|string|max:255',
            'date'             => 'required|date',
            'type'             => 'nullable|in:call,meeting,email,message,event,other',
            'summary'          => 'nullable|string',
            'body'             => 'nullable|string',
            'deal_id'          => 'nullable|uuid|exists:deals,id',
            'participant_ids'  => 'nullable|array',
            'participant_ids.*' => 'uuid|exists:people,id',
            'metadata'         => 'nullable|array',
        ]);

        $discussion = Discussion::create($data);

        if (!empty($data['participant_ids'])) {
            $discussion->participants()->attach($data['participant_ids']);

            // Update last_contacted_at for each participant
            Person::whereIn('id', $data['participant_ids'])
                ->where(fn($q) => $q->whereNull('last_contacted_at')->orWhere('last_contacted_at', '<', $data['date']))
                ->update(['last_contacted_at' => $data['date']]);
        }

        ActivityFeedItem::log('discussion', $discussion->id, 'created');

        return response()->json($discussion->load(['participants', 'deal']), 201);
    }

    public function show(Discussion $discussion): JsonResponse
    {
        return response()->json($discussion->load(['participants.company', 'deal', 'notes']));
    }

    public function update(Request $request, Discussion $discussion): JsonResponse
    {
        $data = $request->validate([
            'title'   => 'sometimes|string|max:255',
            'date'    => 'sometimes|date',
            'type'    => 'sometimes|in:call,meeting,email,message,event,other',
            'summary' => 'sometimes|nullable|string',
            'body'    => 'sometimes|nullable|string',
            'deal_id' => 'sometimes|nullable|uuid|exists:deals,id',
            'metadata' => 'sometimes|nullable|array',
        ]);

        $discussion->update($data);
        ActivityFeedItem::log('discussion', $discussion->id, 'updated');

        return response()->json($discussion->load(['participants', 'deal']));
    }

    public function destroy(Discussion $discussion): JsonResponse
    {
        $discussion->delete();
        return response()->json(null, 204);
    }

    public function addParticipant(Discussion $discussion, Person $person): JsonResponse
    {
        $discussion->participants()->syncWithoutDetaching([$person->id]);
        return response()->json($discussion->load('participants'));
    }

    public function removeParticipant(Discussion $discussion, Person $person): JsonResponse
    {
        $discussion->participants()->detach($person->id);
        return response()->json($discussion->load('participants'));
    }
}
