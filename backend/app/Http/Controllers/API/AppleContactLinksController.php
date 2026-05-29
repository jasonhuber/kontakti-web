<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\AppleContactLink;
use Illuminate\Http\{Request, JsonResponse};

class AppleContactLinksController extends Controller
{
    public function index(): JsonResponse
    {
        $links = AppleContactLink::where('user_id', auth()->id())
            ->select(['person_id', 'cn_contact_identifier', 'device_label', 'updated_at'])
            ->get();

        return response()->json($links);
    }

    public function bulkUpsert(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'links'                          => 'required|array',
            'links.*.person_id'              => 'required|string|max:36',
            'links.*.cn_contact_identifier'  => 'required|string|max:255',
            'links.*.device_label'           => 'nullable|string|max:100',
        ]);

        $userId  = auth()->id();
        $upserted = 0;

        foreach ($validated['links'] as $link) {
            AppleContactLink::updateOrCreate(
                ['user_id' => $userId, 'person_id' => $link['person_id']],
                [
                    'cn_contact_identifier' => $link['cn_contact_identifier'],
                    'device_label'          => $link['device_label'] ?? null,
                ]
            );
            $upserted++;
        }

        return response()->json(['upserted' => $upserted]);
    }

    public function destroyByPerson(string $personId): JsonResponse
    {
        AppleContactLink::where('user_id', auth()->id())
            ->where('person_id', $personId)
            ->delete();

        return response()->json(null, 204);
    }
}
