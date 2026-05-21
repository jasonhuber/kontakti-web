<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Deal, Person, ActivityFeedItem};
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\DB;

class DealsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Deal::with(['company', 'contacts', 'tags'])
            ->withCount(['discussions', 'tasks' => fn($q) => $q->pending()]);

        if ($stage = $request->get('stage')) {
            $query->where('stage', $stage);
        }

        if ($request->boolean('active')) {
            $query->active();
        }

        if ($companyId = $request->get('company_id')) {
            $query->where('company_id', $companyId);
        }

        // Return grouped by stage for kanban
        if ($request->boolean('kanban')) {
            $deals = $query->orderBy('stage')->orderBy('pipeline_position')->get();
            $grouped = collect(Deal::STAGES)->mapWithKeys(fn($stage) => [
                $stage => $deals->where('stage', $stage)->values(),
            ]);
            return response()->json($grouped);
        }

        return response()->json($query->orderBy('pipeline_position')->paginate(50));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'               => 'required|string|max:255',
            'description'         => 'nullable|string',
            'stage'               => 'nullable|in:' . implode(',', Deal::STAGES),
            'value'               => 'nullable|numeric|min:0',
            'currency'            => 'nullable|string|size:3',
            'company_id'          => 'nullable|uuid|exists:companies,id',
            'expected_close_date' => 'nullable|date',
            'metadata'            => 'nullable|array',
        ]);

        $data['pipeline_position'] = Deal::where('stage', $data['stage'] ?? 'discovery')->max('pipeline_position') + 1;

        $deal = Deal::create($data);

        ActivityFeedItem::log('deal', $deal->id, 'created');

        return response()->json($deal->load(['company', 'contacts']), 201);
    }

    public function show(Deal $deal): JsonResponse
    {
        return response()->json(
            $deal->load(['company', 'contacts', 'discussions', 'tags', 'tasks' => fn($q) => $q->pending()])
        );
    }

    public function update(Request $request, Deal $deal): JsonResponse
    {
        $data = $request->validate([
            'title'               => 'sometimes|string|max:255',
            'description'         => 'sometimes|nullable|string',
            'value'               => 'sometimes|nullable|numeric|min:0',
            'currency'            => 'sometimes|string|size:3',
            'company_id'          => 'sometimes|nullable|uuid|exists:companies,id',
            'expected_close_date' => 'sometimes|nullable|date',
            'metadata'            => 'sometimes|nullable|array',
        ]);

        $deal->update($data);

        ActivityFeedItem::log('deal', $deal->id, 'updated');

        return response()->json($deal->load(['company', 'contacts']));
    }

    public function destroy(Deal $deal): JsonResponse
    {
        $deal->delete();
        return response()->json(null, 204);
    }

    public function updateStage(Request $request, Deal $deal): JsonResponse
    {
        $data = $request->validate([
            'stage'    => 'required|in:' . implode(',', Deal::STAGES),
            'position' => 'nullable|integer|min:0',
        ]);

        $oldStage = $deal->stage;

        $deal->update([
            'stage'             => $data['stage'],
            'pipeline_position' => $data['position'] ?? (Deal::where('stage', $data['stage'])->max('pipeline_position') + 1),
            'closed_at'         => in_array($data['stage'], ['closed_won', 'closed_lost']) ? now() : null,
        ]);

        ActivityFeedItem::log('deal', $deal->id, 'stage_changed', null, null, [
            'from' => $oldStage,
            'to'   => $data['stage'],
        ]);

        return response()->json($deal);
    }

    public function reorder(Request $request): JsonResponse
    {
        $request->validate([
            'items'         => 'required|array',
            'items.*.id'    => 'required|uuid|exists:deals,id',
            'items.*.stage' => 'required|in:' . implode(',', Deal::STAGES),
            'items.*.position' => 'required|integer|min:0',
        ]);

        DB::transaction(function () use ($request) {
            foreach ($request->input('items') as $item) {
                Deal::where('id', $item['id'])->update([
                    'stage'             => $item['stage'],
                    'pipeline_position' => $item['position'],
                ]);
            }
        });

        return response()->json(['ok' => true]);
    }

    public function addContact(Request $request, Deal $deal, Person $person): JsonResponse
    {
        $data = $request->validate([
            'role' => 'nullable|string|max:100',
        ]);

        $deal->contacts()->syncWithoutDetaching([
            $person->id => ['role' => $data['role'] ?? null],
        ]);

        return response()->json($deal->load('contacts'));
    }

    public function removeContact(Deal $deal, Person $person): JsonResponse
    {
        $deal->contacts()->detach($person->id);
        return response()->json($deal->load('contacts'));
    }
}
