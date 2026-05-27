<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, SocialActivity};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{Http, Log};

class SocialActivityController extends Controller
{
    public function index(Person $person, Request $request): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $perPage = (int) $request->query('per_page', 20);
        $perPage = max(1, min(100, $perPage));

        $rows = $person->activity()->paginate($perPage);
        return response()->json($rows);
    }

    public function refresh(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $scraperUrl = rtrim((string) config('services.scraper.url', ''), '/');
        if ($scraperUrl === '') {
            return response()->json(['message' => 'Enrichment service not configured.'], 503);
        }

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['X-Api-Key'] = $key;
        }

        $created = [];
        $errors = [];

        $endpoints = [];
        if ($person->instagram_handle) {
            $endpoints[] = ['url' => "{$scraperUrl}/enrich/instagram",       'source' => 'instagram', 'payload' => ['handle' => $person->instagram_handle]];
        }
        if ($person->facebook_url) {
            $endpoints[] = ['url' => "{$scraperUrl}/enrich/facebook-profile", 'source' => 'facebook',  'payload' => ['url' => $person->facebook_url]];
        }

        if (empty($endpoints)) {
            return response()->json(['created' => [], 'message' => 'No social handles to refresh.']);
        }

        foreach ($endpoints as $ep) {
            try {
                $response = Http::timeout(45)->withHeaders($headers)->post($ep['url'], $ep['payload']);
                if ($response->failed()) {
                    $errors[] = ['source' => $ep['source'], 'status' => $response->status()];
                    continue;
                }
                $body = $response->json();
                $activities = $body['activities'] ?? [];
                foreach ($activities as $a) {
                    $externalUrl = $a['external_url'] ?? null;
                    // Upsert by (person_id, source, external_url) when external_url present;
                    // otherwise by (person_id, source, occurred_at, kind).
                    $query = SocialActivity::where('person_id', $person->id)
                        ->where('source', $ep['source']);
                    if ($externalUrl) {
                        $query->where('external_url', $externalUrl);
                    } else {
                        $query->where('kind', $a['kind'] ?? 'post')
                              ->where('occurred_at', $a['occurred_at'] ?? null);
                    }
                    $existing = $query->first();
                    if ($existing) continue;

                    $row = SocialActivity::create([
                        'person_id'    => $person->id,
                        'user_id'      => auth()->id(),
                        'source'       => $ep['source'],
                        'kind'         => $a['kind'] ?? 'post',
                        'occurred_at'  => $a['occurred_at'] ?? now(),
                        'content'      => $a['content'] ?? null,
                        'location'     => $a['location'] ?? null,
                        'image_url'    => $a['image_url'] ?? null,
                        'external_url' => $externalUrl,
                        'engagement'   => $a['engagement'] ?? null,
                        'metadata'     => $a['metadata'] ?? null,
                        'cached_at'    => now(),
                    ]);
                    $created[] = $row;
                }
            } catch (\Throwable $e) {
                Log::warning('Activity refresh failed', ['err' => $e->getMessage()]);
                $errors[] = ['source' => $ep['source'], 'error' => $e->getMessage()];
            }
        }

        return response()->json([
            'created' => $created,
            'errors'  => $errors,
        ]);
    }

    public function acknowledge(SocialActivity $activity): JsonResponse
    {
        abort_if($activity->user_id !== auth()->id(), 403);
        $activity->acknowledged_at = now();
        $activity->save();
        return response()->json($activity);
    }
}
