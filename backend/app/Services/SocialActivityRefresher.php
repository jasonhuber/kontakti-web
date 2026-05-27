<?php

namespace App\Services;

use App\Models\{Person, SocialActivity, User};
use Illuminate\Support\Facades\{Http, Log};

/**
 * Background-friendly mirror of SocialActivityController::refresh(). The
 * controller version is keyed off auth() and one Person at a time; this one
 * loops every person with a social handle for a given user.
 *
 * Single source of truth for the actual proxy calls — if the proxy contract
 * changes, change it here AND in the controller (or refactor the controller
 * to delegate; today they're kept simple + parallel).
 */
class SocialActivityRefresher
{
    public const MAX_PEOPLE_PER_INVOCATION = 50;

    /**
     * @return array{checked:int, created:int, errors:int}
     */
    public function refreshForUser(User $user): array
    {
        $scraperUrl = rtrim((string) config('services.scraper.url', ''), '/');
        if ($scraperUrl === '') {
            return ['checked' => 0, 'created' => 0, 'errors' => 0];
        }

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['X-Api-Key'] = $key;
        }

        $people = $user->people()
            ->where(function ($q) {
                $q->whereNotNull('instagram_handle')
                  ->orWhereNotNull('facebook_url');
            })
            ->limit(self::MAX_PEOPLE_PER_INVOCATION)
            ->get();

        $checked = 0;
        $created = 0;
        $errors  = 0;

        foreach ($people as $person) {
            $checked++;
            $endpoints = [];
            if ($person->instagram_handle) {
                $endpoints[] = ['url' => "{$scraperUrl}/enrich/instagram", 'source' => 'instagram', 'payload' => ['handle' => $person->instagram_handle]];
            }
            if ($person->facebook_url) {
                $endpoints[] = ['url' => "{$scraperUrl}/enrich/facebook-profile", 'source' => 'facebook', 'payload' => ['url' => $person->facebook_url]];
            }

            foreach ($endpoints as $ep) {
                try {
                    $response = Http::timeout(45)->withHeaders($headers)->post($ep['url'], $ep['payload']);
                    if ($response->failed()) {
                        $errors++;
                        continue;
                    }
                    $body = $response->json();
                    $activities = $body['activities'] ?? [];
                    foreach ($activities as $a) {
                        $externalUrl = $a['external_url'] ?? null;
                        $query = SocialActivity::where('person_id', $person->id)
                            ->where('source', $ep['source']);
                        if ($externalUrl) {
                            $query->where('external_url', $externalUrl);
                        } else {
                            $query->where('kind', $a['kind'] ?? 'post')
                                  ->where('occurred_at', $a['occurred_at'] ?? null);
                        }
                        if ($query->exists()) continue;

                        SocialActivity::create([
                            'person_id'    => $person->id,
                            'user_id'      => $user->id,
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
                        $created++;
                    }
                } catch (\Throwable $e) {
                    $errors++;
                    Log::warning('SocialActivityRefresher endpoint failed', [
                        'person_id' => $person->id,
                        'source'    => $ep['source'],
                        'err'       => $e->getMessage(),
                    ]);
                }
            }
        }

        return ['checked' => $checked, 'created' => $created, 'errors' => $errors];
    }
}
