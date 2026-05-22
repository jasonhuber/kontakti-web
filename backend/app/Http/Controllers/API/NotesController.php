<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Note;
use App\Services\ObsidianExportService;
use Illuminate\Http\{Request, JsonResponse};

class NotesController extends Controller
{
    public function __construct(private ObsidianExportService $obsidian) {}

    public function index(Request $request): JsonResponse
    {
        $query = Note::where('user_id', auth()->id())->with('tags')->orderByDesc('updated_at');

        if ($search = $request->get('q')) {
            $query->search($search);
        }

        if ($notableType = $request->get('notable_type')) {
            $query->where('notable_type', $notableType)
                  ->where('notable_id', $request->get('notable_id'));
        }

        return response()->json($query->paginate(50));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'        => 'nullable|string|max:255',
            'body'         => 'required|string',
            'notable_type' => 'nullable|string|max:100',
            'notable_id'   => 'nullable|uuid',
            'metadata'     => 'nullable|array',
        ]);

        $data['user_id'] = auth()->id();
        $note = Note::create($data);
        return response()->json($note, 201);
    }

    public function show(Note $note): JsonResponse
    {
        abort_if($note->user_id !== auth()->id(), 403);

        return response()->json($note->load('tags'));
    }

    public function update(Request $request, Note $note): JsonResponse
    {
        abort_if($note->user_id !== auth()->id(), 403);

        $data = $request->validate([
            'title'    => 'sometimes|nullable|string|max:255',
            'body'     => 'sometimes|string',
            'metadata' => 'sometimes|nullable|array',
        ]);

        $note->update($data);
        return response()->json($note);
    }

    public function destroy(Note $note): JsonResponse
    {
        abort_if($note->user_id !== auth()->id(), 403);

        $note->delete();
        return response()->json(null, 204);
    }

    public function exportToObsidian(Note $note): JsonResponse
    {
        abort_if($note->user_id !== auth()->id(), 403);

        $path = $this->obsidian->exportNote($note);
        return response()->json(['path' => $path, 'synced_at' => $note->fresh()->synced_at]);
    }
}
