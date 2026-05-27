<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company, Discussion, Note};
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\{Cache, Http, Log};

class SearchController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $term = $request->validate(['q' => 'required|string|min:2'])['q'];

        $results = [];

        $people = Person::search($term)
            ->where('user_id', auth()->id())
            ->with('company')
            ->limit(5)
            ->get()
            ->map(fn($p) => [
                'type'     => 'person',
                'id'       => $p->id,
                'title'    => $p->full_name,
                'subtitle' => implode(' · ', array_filter([$p->title, $p->company?->name])),
                'url'      => "/people/{$p->id}",
            ]);

        $companies = Company::search($term)
            ->where('user_id', auth()->id())
            ->limit(5)
            ->get()
            ->map(fn($c) => [
                'type'     => 'company',
                'id'       => $c->id,
                'title'    => $c->name,
                'subtitle' => implode(' · ', array_filter([$c->industry, $c->domain])),
                'url'      => "/companies/{$c->id}",
            ]);

        $discussions = Discussion::search($term)
            ->where('user_id', auth()->id())
            ->limit(5)
            ->get()
            ->map(fn($d) => [
                'type'     => 'discussion',
                'id'       => $d->id,
                'title'    => $d->title,
                'subtitle' => $d->date->format('M j, Y'),
                'url'      => "/discussions/{$d->id}",
            ]);

        $notes = Note::search($term)
            ->where('user_id', auth()->id())
            ->limit(5)
            ->get()
            ->map(fn($n) => [
                'type'     => 'note',
                'id'       => $n->id,
                'title'    => $n->title ?? 'Untitled note',
                'subtitle' => substr(strip_tags($n->body), 0, 100),
                'url'      => "/notes/{$n->id}",
            ]);

        return response()->json([
            'query'   => $term,
            'results' => $people->merge($companies)->merge($discussions)->merge($notes)->values(),
            'counts'  => [
                'people'      => $people->count(),
                'companies'   => $companies->count(),
                'discussions' => $discussions->count(),
                'notes'       => $notes->count(),
            ],
        ]);
    }

    /**
     * POST /api/v1/search/natural
     *
     * Forwards a natural-language query plus a digest of the user's people to
     * the enrichment proxy's /api/search-natural endpoint (Claude-backed). The
     * proxy returns ranked person_ids + reasoning, which we hydrate back into
     * full Person records before returning. 5-minute cache per (user, query).
     */
    public function naturalSearch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'query' => 'required|string|min:2|max:500',
            'limit' => 'nullable|integer|min:1|max:50',
        ]);

        $user = $request->user();
        $limit = $data['limit'] ?? 10;

        $cacheKey = 'natural-search:' . $user->id . ':' . md5(strtolower($data['query'])) . ':' . $limit;

        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return response()->json($cached);
        }

        $base = rtrim((string) config('services.scraper.url', ''), '/');
        if ($base === '') {
            return response()->json([
                'error' => 'upstream_unavailable',
                'remediation' => 'Enrichment proxy URL not configured.',
            ], 502);
        }
        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['x-api-key'] = $key;
        }

        // Cap at 500 most-recently-contacted contacts to keep payload sane.
        $contacts = $user->people()
            ->with('company:id,name')
            ->orderByDesc('last_contacted_at')
            ->limit(500)
            ->get()
            ->map(fn ($p) => array_filter([
                'id'                    => $p->id,
                'name'                  => trim("{$p->first_name} {$p->last_name}"),
                'title'                 => $p->title,
                'company'               => $p->company?->name,
                'city'                  => $p->city,
                'region'                => $p->region,
                'country'               => $p->country,
                'relationship_strength' => $p->relationship_strength,
                'tags'                  => $p->tags()->pluck('name')->all() ?: null,
                'previous_employers'    => $p->previous_employers,
                'last_contacted_at'     => $p->last_contacted_at?->toIso8601String(),
            ], fn ($v) => $v !== null && $v !== ''))
            ->values()
            ->all();

        try {
            $response = Http::withHeaders($headers)
                ->timeout(60)
                ->post($base . '/api/search-natural', [
                    'query'    => $data['query'],
                    'contacts' => $contacts,
                ]);
        } catch (\Throwable $e) {
            Log::warning('Natural search transport failed', ['err' => $e->getMessage()]);
            return response()->json(['error' => 'upstream_unavailable'], 502);
        }

        if (!$response->ok()) {
            Log::warning('Natural search non-2xx', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            return response()->json(['error' => 'upstream_unavailable'], 502);
        }

        $results = $response->json('results') ?? [];

        $ids = array_values(array_filter(array_map(fn ($r) => $r['person_id'] ?? null, $results)));
        $people = Person::whereIn('id', $ids)
            ->where('user_id', $user->id)
            ->with(['company', 'emails', 'phones'])
            ->get()
            ->keyBy('id');

        $hydrated = [];
        foreach ($results as $r) {
            $pid = $r['person_id'] ?? null;
            if (!$pid || !isset($people[$pid])) continue;
            $hydrated[] = [
                'person'    => $people[$pid],
                'score'     => $r['score']     ?? null,
                'reasoning' => $r['reasoning'] ?? null,
            ];
            if (count($hydrated) >= $limit) break;
        }

        $payload = [
            'query'   => $data['query'],
            'results' => $hydrated,
        ];

        Cache::put($cacheKey, $payload, now()->addMinutes(5));

        return response()->json($payload);
    }
}
