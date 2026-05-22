<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Note;
use App\Services\ObsidianExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ObsidianController extends Controller
{
    public function __construct(private ObsidianExportService $exporter) {}

    public function status(): JsonResponse
    {
        $vaultPath = config('obsidian.vault_path');

        return response()->json([
            'vault_path'     => $vaultPath,
            'vault_exists'   => is_dir($vaultPath),
            'sync_enabled'   => config('obsidian.sync_enabled'),
            'auto_sync'      => config('obsidian.auto_sync'),
            'unsynced_notes' => Note::where('user_id', auth()->id())->unsynced()->count(),
        ]);
    }

    public function exportAll(): JsonResponse
    {
        $counts = $this->exporter->exportAll();

        return response()->json([
            'exported' => $counts,
            'path'     => config('obsidian.vault_path') . '/' . config('obsidian.crm_folder'),
        ]);
    }

    public function exportOne(Request $request, string $type, string $id): JsonResponse
    {
        $userId = auth()->id();

        $path = match ($type) {
            'person'     => $this->exporter->exportPerson(
                \App\Models\Person::where('user_id', $userId)->findOrFail($id)
            ),
            'company'    => $this->exporter->exportCompany(
                \App\Models\Company::where('user_id', $userId)->findOrFail($id)
            ),
            'discussion' => $this->exporter->exportDiscussion(
                \App\Models\Discussion::where('user_id', $userId)->findOrFail($id)
            ),
            'deal'       => $this->exporter->exportDeal(
                \App\Models\Deal::where('user_id', $userId)->findOrFail($id)
            ),
            'note'       => $this->exporter->exportNote(
                \App\Models\Note::where('user_id', $userId)->findOrFail($id)
            ),
            default      => abort(422, "Unknown type: {$type}"),
        };

        return response()->json(['path' => $path]);
    }
}
