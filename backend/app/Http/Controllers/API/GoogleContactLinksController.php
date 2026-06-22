<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{GoogleContactLink, Person};
use App\Services\GoogleContactsWriter;
use Illuminate\Http\JsonResponse;

class GoogleContactLinksController extends Controller
{
    public function __construct(private GoogleContactsWriter $writer) {}

    public function index(): JsonResponse
    {
        $links = GoogleContactLink::where('user_id', auth()->id())
            ->select(['person_id', 'resource_name', 'account_email', 'last_pushed_at', 'updated_at'])
            ->get();

        return response()->json($links);
    }

    /**
     * Create or update the linked Google contact for this person, pushing
     * Kontakti's current field values. Returns the stored link, or a clear
     * error (e.g. missing Contacts OAuth scope) the UI can show.
     */
    public function push(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $person->loadMissing('company');

        try {
            $link = $this->writer->pushPerson($person);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'person_id'      => $link->person_id,
            'resource_name'  => $link->resource_name,
            'account_email'  => $link->account_email,
            'last_pushed_at' => $link->last_pushed_at?->toIso8601String(),
        ], 200);
    }

    public function destroyByPerson(string $personId): JsonResponse
    {
        GoogleContactLink::where('user_id', auth()->id())
            ->where('person_id', $personId)
            ->delete();

        return response()->json(null, 204);
    }
}
