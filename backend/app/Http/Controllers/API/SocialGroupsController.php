<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, SocialGroup};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{DB, Http, Log};
use Illuminate\Validation\Rule;

class SocialGroupsController extends Controller
{
    private const SOURCES = ['facebook_group', 'whatsapp_group', 'instagram_followers', 'manual'];

    public function index(): JsonResponse
    {
        $rows = SocialGroup::where('user_id', auth()->id())
            ->withCount('members')
            ->orderByDesc('created_at')
            ->get();
        return response()->json($rows);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source'      => ['required', Rule::in(self::SOURCES)],
            'external_id' => 'nullable|string|max:255',
            'name'        => 'nullable|string|max:255',
        ]);

        $name = $data['name'] ?? ($data['external_id'] ?? 'Untitled group');

        $row = SocialGroup::create([
            'user_id'     => auth()->id(),
            'source'      => $data['source'],
            'external_id' => $data['external_id'] ?? null,
            'name'        => $name,
            'metadata'    => [],
        ]);

        return response()->json($row, 201);
    }

    public function destroy(SocialGroup $social_group): JsonResponse
    {
        abort_if($social_group->user_id !== auth()->id(), 403);

        // Detach members without deleting the people.
        DB::table('social_group_members')->where('social_group_id', $social_group->id)->delete();

        $social_group->delete();
        return response()->json(null, 204);
    }

    /**
     * Trigger a member sync via the enrichment proxy.
     *
     * TODO: the proxy's /enrich/facebook-group/members expects { url } and
     * /enrich/whatsapp-group/members expects { group_name_or_jid } — we
     * currently POST { external_id, name } which won't match. The new picker
     * UI stores `external_id = facebook_group_id` (numeric) or `whatsapp jid`,
     * so we need to either (a) reconstruct the FB group URL here as
     * "https://www.facebook.com/groups/{external_id}/" and forward jid as
     * group_name_or_jid, or (b) teach the proxy member endpoints to accept
     * the raw id/jid. Fix in next pass — out of scope for the picker task.
     */
    public function sync(SocialGroup $social_group): JsonResponse
    {
        abort_if($social_group->user_id !== auth()->id(), 403);

        $scraperUrl = rtrim((string) config('services.scraper.url', ''), '/');
        if ($scraperUrl === '') {
            return response()->json(['message' => 'Enrichment service not configured.'], 503);
        }

        $endpoint = match ($social_group->source) {
            'facebook_group' => '/enrich/facebook-group/members',
            'whatsapp_group' => '/enrich/whatsapp-group/members',
            default          => null,
        };
        if (!$endpoint) {
            return response()->json(['message' => "Sync not supported for source '{$social_group->source}'."], 422);
        }

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['X-Api-Key'] = $key;
        }

        // Build the proxy payload per source. FB member endpoint expects { url };
        // WhatsApp member endpoint expects { group_name_or_jid }. The picker may
        // store an empty jid (WA Web doesn't expose it), so fall back to the name.
        $payload = match ($social_group->source) {
            'facebook_group' => [
                'url' => str_starts_with($social_group->external_id ?? '', 'http')
                    ? $social_group->external_id
                    : "https://www.facebook.com/groups/{$social_group->external_id}/",
            ],
            'whatsapp_group' => [
                'group_name_or_jid' => !empty($social_group->external_id)
                    ? $social_group->external_id
                    : ($social_group->name ?? ''),
            ],
            default => [],
        };

        try {
            $response = Http::timeout(120)
                ->withHeaders($headers)
                ->post("{$scraperUrl}{$endpoint}", $payload);
            if ($response->failed()) {
                return response()->json([
                    'message' => 'Proxy sync failed: ' . $response->status(),
                ], 502);
            }
            $body = $response->json();
            $members = $body['members'] ?? [];
        } catch (\Throwable $e) {
            Log::warning('Group sync proxy failed', ['err' => $e->getMessage()]);
            return response()->json(['message' => 'Proxy sync error: ' . $e->getMessage()], 502);
        }

        $userId = auth()->id();
        $created = 0;
        $attached = 0;

        foreach ($members as $m) {
            $person = $this->matchOrCreatePerson($m, $userId, $social_group->source, $createdFlag);
            if (!$person) continue;
            if ($createdFlag) $created++;

            $exists = DB::table('social_group_members')
                ->where('social_group_id', $social_group->id)
                ->where('person_id', $person->id)
                ->exists();
            if (!$exists) {
                DB::table('social_group_members')->insert([
                    'social_group_id' => $social_group->id,
                    'person_id'       => $person->id,
                    'role'            => $m['role'] ?? null,
                    'joined_at'       => $m['joined_at'] ?? null,
                    'created_at'      => now(),
                ]);
                $attached++;
            }
        }

        $memberCount = DB::table('social_group_members')
            ->where('social_group_id', $social_group->id)
            ->count();

        $social_group->member_count = $memberCount;
        $social_group->last_synced_at = now();
        $social_group->save();

        return response()->json([
            'created'      => $created,
            'attached'     => $attached,
            'member_count' => $memberCount,
        ]);
    }

    /**
     * Find an existing person by social handle / whatsapp phone / name, or create one.
     */
    private function matchOrCreatePerson(array $m, int $userId, string $source, ?bool &$createdFlag): ?Person
    {
        $createdFlag = false;

        $instagram = isset($m['instagram_handle']) ? ltrim((string) $m['instagram_handle'], '@') : null;
        $facebookUrl = $m['facebook_url'] ?? null;
        $whatsappPhone = isset($m['whatsapp_phone']) ? preg_replace('/\D+/', '', (string) $m['whatsapp_phone']) : null;
        $firstName = trim((string) ($m['first_name'] ?? ''));
        $lastName = trim((string) ($m['last_name'] ?? ''));
        $fullName = trim((string) ($m['name'] ?? ''));

        if ($firstName === '' && $fullName !== '') {
            $parts = preg_split('/\s+/', $fullName, 2);
            $firstName = $parts[0] ?? '';
            $lastName = $parts[1] ?? '';
        }

        // Skip records with no usable identifier
        if ($firstName === '' && !$instagram && !$facebookUrl && !$whatsappPhone) {
            return null;
        }

        $query = Person::where('user_id', $userId);
        $matched = null;

        if ($instagram) {
            $matched = (clone $query)->whereRaw('LOWER(instagram_handle) = ?', [strtolower($instagram)])->first();
        }
        if (!$matched && $whatsappPhone) {
            $matched = (clone $query)->where('whatsapp_phone', $whatsappPhone)->first();
        }
        if (!$matched && $facebookUrl) {
            $matched = (clone $query)->where('facebook_url', $facebookUrl)->first();
        }
        if (!$matched && $firstName !== '') {
            $matched = (clone $query)
                ->whereRaw('LOWER(first_name) = ?', [strtolower($firstName)])
                ->when($lastName !== '', fn($q) => $q->whereRaw('LOWER(last_name) = ?', [strtolower($lastName)]))
                ->first();
        }

        if ($matched) {
            // Backfill any missing handle.
            $dirty = false;
            if ($instagram && !$matched->instagram_handle)   { $matched->instagram_handle = $instagram; $dirty = true; }
            if ($facebookUrl && !$matched->facebook_url)     { $matched->facebook_url = $facebookUrl;   $dirty = true; }
            if ($whatsappPhone && !$matched->whatsapp_phone) { $matched->whatsapp_phone = $whatsappPhone; $dirty = true; }
            if ($dirty) $matched->save();
            return $matched;
        }

        $createdFlag = true;
        return Person::create([
            'user_id'               => $userId,
            'first_name'            => $firstName ?: ($instagram ?: $whatsappPhone ?: 'Unknown'),
            'last_name'             => $lastName,
            'avatar_url'            => $m['avatar_url'] ?? null,
            'instagram_handle'      => $instagram,
            'facebook_url'          => $facebookUrl,
            'whatsapp_phone'        => $whatsappPhone,
            'relationship_strength' => 'cold',
            'metadata'              => ['imported_from' => $source],
        ]);
    }
}
