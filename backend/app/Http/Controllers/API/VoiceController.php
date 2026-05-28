<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Discussion, Person, Task};
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{Http, Log, Storage};
use Illuminate\Support\Str;

/**
 * Voice capture → transcribe → extract entities → write Discussions + Tasks.
 *
 * Forwards audio to the enrichment proxy's /api/transcribe + /api/extract-entities
 * endpoints (a sister agent owns the proxy). We don't store the audio long-term
 * — it lives in storage/app/voice-tmp/ for the request lifetime and is deleted
 * before the response is returned.
 *
 * TODO: persist audio to S3 (or similar) once we want playback / replays of the
 * raw recording in the UI. Today the AI summary + transcript is all we keep.
 */
class VoiceController extends Controller
{
    public const CONTACTS_HINT_LIMIT = 20;

    public function capture(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'audio'     => 'required|file|max:51200', // 50 MB ceiling
            'person_id' => 'nullable|uuid|exists:people,id',
            'context'   => 'nullable|string|max:2000',
        ]);

        $user = $request->user();

        $base = rtrim((string) config('services.scraper.url', ''), '/');
        if ($base === '') {
            return response()->json([
                'error'       => 'upstream_not_configured',
                'message'     => 'Transcription service is not configured.',
                'remediation' => 'Enrichment proxy URL not configured.',
            ], 503);
        }
        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['x-api-key'] = $key;
        }

        // Optional person scope — must be owned by the user
        $person = null;
        if (!empty($validated['person_id'])) {
            $person = Person::where('id', $validated['person_id'])
                ->where('user_id', $user->id)
                ->first();
            abort_unless($person, 404, 'Person not found.');
        }

        // Stash the upload in storage/app/voice-tmp/ so we control deletion.
        $uploaded = $request->file('audio');
        $tmpName = 'voice-tmp/' . Str::uuid()->toString() . '-' . $uploaded->getClientOriginalName();
        Storage::disk('local')->putFileAs(
            'voice-tmp',
            $uploaded,
            basename($tmpName)
        );
        $tmpPath = Storage::disk('local')->path($tmpName);

        try {
            // 1. Transcribe — guard against the upstream being down. Cloudflare
            // intercepts 502 responses from origin and replaces the body with a
            // plaintext "error code: 502" page, so the SPA can't surface a
            // useful message. Use 503 (Service Unavailable) instead — Cloudflare
            // passes 503 bodies through unchanged.
            try {
                $transcribeResponse = Http::withHeaders($headers)
                    ->timeout(120)
                    ->attach('audio', fopen($tmpPath, 'r'), $uploaded->getClientOriginalName())
                    ->post($base . '/api/transcribe');
            } catch (ConnectionException $e) {
                Log::warning('Voice transcribe connect failed', ['err' => $e->getMessage()]);
                return response()->json([
                    'error'   => 'upstream_unavailable',
                    'step'    => 'transcribe',
                    'message' => 'Transcription service unreachable: ' . $e->getMessage(),
                ], 503);
            }

            if (!$transcribeResponse->ok()) {
                Log::warning('Voice transcribe non-2xx', [
                    'status' => $transcribeResponse->status(),
                    'body'   => Str::limit($transcribeResponse->body(), 500),
                ]);
                return response()->json([
                    'error'   => 'upstream_unavailable',
                    'step'    => 'transcribe',
                    'message' => 'Transcription service returned ' . $transcribeResponse->status() . '. Try again in a moment.',
                ], 503);
            }

            $tx = $transcribeResponse->json();
            $transcript = (string) ($tx['transcript'] ?? '');

            if (trim($transcript) === '') {
                return response()->json([
                    'transcript'  => '',
                    'summary'     => null,
                    'discussions' => [],
                    'tasks'       => [],
                    'person_refs' => [],
                    'warning'     => 'Empty transcript from upstream.',
                ]);
            }

            // 2. Extract entities — give Claude a hint about recently-contacted people
            $contactsHint = $user->people()
                ->with('company:id,name')
                ->orderByDesc('last_contacted_at')
                ->limit(self::CONTACTS_HINT_LIMIT)
                ->get(['id', 'first_name', 'last_name', 'company_id'])
                ->map(fn ($p) => array_filter([
                    'id'      => $p->id,
                    'name'    => trim("{$p->first_name} {$p->last_name}"),
                    'company' => $p->company?->name,
                ]))
                ->values()
                ->all();

            try {
                $extractResponse = Http::withHeaders($headers)
                    ->timeout(60)
                    ->post($base . '/api/extract-entities', [
                        'transcript'    => $transcript,
                        'user_id'       => $user->id,
                        'contacts_hint' => $contactsHint,
                        'context'       => $validated['context'] ?? null,
                    ]);
            } catch (ConnectionException $e) {
                Log::warning('Voice extract connect failed', ['err' => $e->getMessage()]);
                $extractResponse = null;
            }

            if (!$extractResponse || !$extractResponse->ok()) {
                Log::warning('Voice extract non-2xx', [
                    'status' => $extractResponse?->status(),
                    'body'   => $extractResponse ? Str::limit($extractResponse->body(), 500) : '(connect failed)',
                ]);
                return response()->json([
                    'transcript'  => $transcript,
                    'duration_s'  => $tx['duration_s'] ?? null,
                    'summary'     => null,
                    'discussions' => [],
                    'tasks'       => [],
                    'person_refs' => [],
                    'warning'     => 'Entity extraction failed; transcript saved.',
                ]);
            }

            $entities = $extractResponse->json();
            $summary  = $entities['summary']     ?? null;
            $discIn   = $entities['discussions'] ?? [];
            $taskIn   = $entities['tasks']       ?? [];
            $personRefs = $entities['person_refs'] ?? [];

            $createdDiscussions = [];
            foreach ($discIn as $d) {
                $participantIds = array_values(array_filter(
                    (array) ($d['participant_ids'] ?? []),
                    fn ($id) => is_string($id) && Str::isUuid($id)
                ));
                // Filter to people owned by this user
                if (!empty($participantIds)) {
                    $participantIds = Person::whereIn('id', $participantIds)
                        ->where('user_id', $user->id)
                        ->pluck('id')
                        ->all();
                }
                // If person_id passed on the request, always include them.
                if ($person && !in_array($person->id, $participantIds, true)) {
                    $participantIds[] = $person->id;
                }

                $discussion = Discussion::create([
                    'user_id' => $user->id,
                    'title'   => Str::limit($d['summary'] ?? 'Voice note', 250, ''),
                    'date'    => $d['happened_at_iso'] ?? now(),
                    'type'    => $this->normalizeType($d['type'] ?? null),
                    'summary' => $d['summary'] ?? null,
                    'body'    => $transcript,
                    'metadata' => [
                        'source'           => 'voice',
                        'transcript_duration_s' => $tx['duration_s'] ?? null,
                    ],
                ]);
                if (!empty($participantIds)) {
                    $discussion->participants()->attach($participantIds);
                    Person::whereIn('id', $participantIds)
                        ->where(function ($q) use ($discussion) {
                            $q->whereNull('last_contacted_at')
                              ->orWhere('last_contacted_at', '<', $discussion->date);
                        })
                        ->update(['last_contacted_at' => $discussion->date]);
                }
                $createdDiscussions[] = $discussion->load('participants');
            }

            $createdTasks = [];
            foreach ($taskIn as $t) {
                $taskableType = null;
                $taskableId = null;

                $assignee = $t['assignee_person_id'] ?? null;
                if ($assignee && Str::isUuid($assignee)
                    && Person::where('id', $assignee)->where('user_id', $user->id)->exists()
                ) {
                    $taskableType = Person::class;
                    $taskableId = $assignee;
                } elseif ($person) {
                    $taskableType = Person::class;
                    $taskableId = $person->id;
                } elseif (!empty($createdDiscussions)) {
                    $taskableType = Discussion::class;
                    $taskableId = $createdDiscussions[0]->id;
                }

                $createdTasks[] = Task::create([
                    'user_id'       => $user->id,
                    'title'         => Str::limit($t['title'] ?? 'Follow up', 250, ''),
                    'due_at'        => $t['due_at'] ?? null,
                    'priority'      => $this->normalizePriority($t['priority'] ?? null),
                    'taskable_type' => $taskableType,
                    'taskable_id'   => $taskableId,
                ]);
            }

            // If the request scoped to a person, also attach every created
            // discussion to that person (in case the AI didn't echo it back).
            if ($person) {
                foreach ($createdDiscussions as $disc) {
                    $disc->participants()->syncWithoutDetaching([$person->id]);
                }
            }

            return response()->json([
                'transcript'  => $transcript,
                'duration_s'  => $tx['duration_s'] ?? null,
                'summary'     => $summary,
                'discussions' => $createdDiscussions,
                'tasks'       => $createdTasks,
                'person_refs' => $personRefs,
            ]);
        } finally {
            // Always delete the temp audio file before returning.
            Storage::disk('local')->delete($tmpName);
        }
    }

    private function normalizeType(?string $type): string
    {
        $allowed = ['call', 'meeting', 'email', 'message', 'event', 'other'];
        return in_array($type, $allowed, true) ? $type : 'other';
    }

    private function normalizePriority(?string $priority): string
    {
        $allowed = ['low', 'medium', 'high', 'urgent'];
        return in_array($priority, $allowed, true) ? $priority : 'medium';
    }
}
