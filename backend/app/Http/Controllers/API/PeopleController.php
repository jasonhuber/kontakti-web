<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company, ActivityFeedItem, ReachOutLog, ContactScheduleItem};
use App\Services\PersonContactSync;
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\{Http, Storage};
use Illuminate\Validation\Rule;

class PeopleController extends Controller
{
    private const URL_LABELS = ['website', 'linkedin', 'twitter', 'facebook', 'instagram', 'other'];
    private const ADDRESS_LABELS = ['home', 'work', 'other'];

    public function index(Request $request): JsonResponse
    {
        $query = auth()->user()->people()
            ->with(['company', 'tags', 'emails', 'phones'])
            ->withCount(['discussions', 'deals', 'tasks' => fn($q) => $q->pending()]);

        if ($search = $request->get('q')) {
            $query->search($search);
        }

        if ($companyId = $request->get('company_id')) {
            $query->where('company_id', $companyId);
        }

        if ($strength = $request->get('relationship_strength')) {
            $query->where('relationship_strength', $strength);
        }

        if ($tag = $request->get('tag')) {
            $query->whereHas('tags', fn($q) => $q->where('slug', $tag));
        }

        if ($request->boolean('overdue')) {
            $query->overdue();
        }

        if ($request->boolean('needs_review')) {
            $query->where('needs_review', true);
        }

        $people = $query->orderBy('last_name')->paginate(50);

        return response()->json($people);
    }

    /**
     * Returns counts (and a few sample IDs) per "needs cleanup" bucket so the
     * client can build a Review Contacts queue without scrolling every row.
     *
     * Buckets are intentionally lossy — a single person can land in multiple.
     */
    public function health(): JsonResponse
    {
        $base = auth()->user()->people();
        $total = (clone $base)->count();

        $buckets = [
            'missing_first_name' => (clone $base)
                ->where(fn($q) => $q->whereNull('first_name')->orWhere('first_name', '')),
            'missing_last_name' => (clone $base)
                ->where(fn($q) => $q->whereNull('last_name')->orWhere('last_name', '')),
            'missing_contact_info' => (clone $base)
                ->where(fn($q) => $q->whereNull('email')->orWhere('email', ''))
                ->where(fn($q) => $q->whereNull('phone')->orWhere('phone', '')),
            'invalid_email' => (clone $base)
                ->whereNotNull('email')
                ->where('email', '!=', '')
                ->whereRaw("email NOT LIKE '%_@_%._%'"),
            'unlinked_company' => (clone $base)
                ->whereNull('company_id')
                ->whereRaw("JSON_EXTRACT(metadata, '$.company_name') IS NOT NULL"),
            'needs_review' => (clone $base)->where('needs_review', true),
            'imported_unreviewed' => (clone $base)
                ->whereNull('reviewed_at')
                ->whereRaw("JSON_EXTRACT(metadata, '$.import_source') IS NOT NULL"),
        ];

        $payload = [
            'total' => $total,
            'buckets' => [],
        ];

        foreach ($buckets as $key => $q) {
            $count = (clone $q)->count();
            $samples = (clone $q)->limit(8)
                ->get(['id', 'first_name', 'last_name', 'email'])
                ->map(fn($p) => [
                    'id'         => $p->id,
                    'first_name' => $p->first_name,
                    'last_name'  => $p->last_name,
                    'email'      => $p->email,
                ]);
            $payload['buckets'][$key] = [
                'count'   => $count,
                'samples' => $samples,
            ];
        }

        // Duplicate-email bucket: emails shared by 2+ rows.
        $dupEmails = (clone $base)
            ->whereNotNull('email')
            ->where('email', '!=', '')
            ->selectRaw('LOWER(email) AS lemail, COUNT(*) AS c')
            ->groupBy('lemail')
            ->havingRaw('c > 1')
            ->pluck('lemail');

        $dupRows = $dupEmails->isEmpty()
            ? collect()
            : (clone $base)
                ->whereIn(\DB::raw('LOWER(email)'), $dupEmails)
                ->get(['id', 'first_name', 'last_name', 'email']);

        $payload['buckets']['duplicate_email'] = [
            'count'   => $dupRows->count(),
            'samples' => $dupRows->take(8)->map(fn($p) => [
                'id'         => $p->id,
                'first_name' => $p->first_name,
                'last_name'  => $p->last_name,
                'email'      => $p->email,
            ])->values(),
        ];

        return response()->json($payload);
    }

    /**
     * Mark a person as reviewed: sets `reviewed_at = now()` and clears the
     * `needs_review` flag. Idempotent — calling again just bumps the timestamp.
     */
    public function review(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $person->update([
            'reviewed_at'  => now(),
            'needs_review' => false,
        ]);

        return response()->json($person->fresh(['company', 'tags']));
    }

    public function store(Request $request, PersonContactSync $sync): JsonResponse
    {
        $this->normalizeSocialFields($request);
        $data = $request->validate($this->validationRules(null, true));

        $emails = $data['emails'] ?? null;
        $phones = $data['phones'] ?? null;
        $tags   = $data['tags'] ?? null;
        unset($data['emails'], $data['phones'], $data['tags']);

        $data['user_id']   = auth()->id();
        $data['last_name'] = $data['last_name'] ?? '';
        $person = Person::create($data);

        // Persist multi-contact lists if provided; otherwise upsert single primary row
        // from legacy fields so the new tables stay the source of truth.
        if ($emails !== null) {
            $sync->apply($person, $emails, null);
        } elseif (!empty($data['email'])) {
            $sync->apply($person, [['value' => $data['email'], 'label' => 'other', 'is_primary' => true]], null);
        }

        if ($phones !== null) {
            $sync->apply($person, null, $phones);
        } elseif (!empty($data['phone'])) {
            $sync->apply($person, null, [['value' => $data['phone'], 'label' => 'mobile', 'is_primary' => true]]);
        }

        if (!empty($tags)) {
            $this->syncTags($person, $tags);
        }

        ActivityFeedItem::log('person', $person->id, 'created');
        auth()->user()->markOnboarded();

        return response()->json($person->load(['company', 'tags', 'emails', 'phones']), 201);
    }

    public function show(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->load([
                'company', 'tags', 'emails', 'phones', 'photos',
                'tasks' => fn($q) => $q->pending()->orderBy('due_at'),
                'socialGroups',
                'activity' => fn($q) => $q->limit(10),
                'introducedBy',
            ])
        );
    }

    public function update(Request $request, Person $person, PersonContactSync $sync): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $this->normalizeSocialFields($request);
        $data = $request->validate($this->validationRules($person->id, false));

        $emails = array_key_exists('emails', $data) ? $data['emails'] : null;
        $phones = array_key_exists('phones', $data) ? $data['phones'] : null;
        $tagsProvided = array_key_exists('tags', $data);
        $tags = $tagsProvided ? ($data['tags'] ?? []) : null;
        unset($data['emails'], $data['phones'], $data['tags']);

        if (array_key_exists('last_name', $data)) {
            $data['last_name'] = $data['last_name'] ?? '';
        }

        $person->update($data);

        if ($emails !== null) {
            $sync->apply($person, $emails, null);
        } elseif (array_key_exists('email', $data)) {
            $value = $data['email'];
            if ($value) {
                $sync->apply($person, [['value' => $value, 'label' => 'other', 'is_primary' => true]], null);
            } else {
                $sync->apply($person, [], null);
            }
        }

        if ($phones !== null) {
            $sync->apply($person, null, $phones);
        } elseif (array_key_exists('phone', $data)) {
            $value = $data['phone'];
            if ($value) {
                $sync->apply($person, null, [['value' => $value, 'label' => 'mobile', 'is_primary' => true]]);
            } else {
                $sync->apply($person, null, []);
            }
        }

        if ($tagsProvided) {
            $this->syncTags($person, $tags ?? []);
        }

        ActivityFeedItem::log('person', $person->id, 'updated');

        return response()->json($person->load(['company', 'tags', 'emails', 'phones']));
    }

    /**
     * Validation rules shared between store + update.
     */
    private function validationRules(?string $personId, bool $isStore): array
    {
        $req = $isStore ? 'required' : 'sometimes';
        $opt = $isStore ? 'nullable' : 'sometimes|nullable';
        $emailUnique = $personId
            ? "sometimes|nullable|email|unique:people,email,{$personId}"
            : 'nullable|email|unique:people';

        return [
            'first_name'            => "{$req}|string|max:100",
            'last_name'             => "{$opt}|string|max:100",
            'nickname'              => "{$opt}|string|max:100",
            'email'                 => $emailUnique,
            'phone'                 => "{$opt}|string|max:50",
            'linkedin_url'          => "{$opt}|url|max:500",
            // Scope FK existence to this user so you can't link to / leak another tenant's company.
            'company_id'            => array_merge(explode('|', "{$opt}|uuid"), [Rule::exists('companies', 'id')->where('user_id', auth()->id())]),
            'title'                 => "{$opt}|string|max:200",
            'job_department'        => "{$opt}|string|max:100",
            'relationship_strength' => ($isStore ? 'nullable|' : 'sometimes|') . 'in:cold,warm,hot,close',
            'last_contacted_at'     => "{$opt}|date",
            'next_followup_at'      => "{$opt}|date",
            'contact_cadence'       => ($isStore ? 'nullable|' : 'sometimes|') . 'in:none,monthly,quarterly,biannual,annual',
            'contact_on_birthday'   => ($isStore ? 'nullable|' : 'sometimes|') . 'boolean',
            'contact_on_holidays'   => ($isStore ? 'nullable|' : 'sometimes|') . 'boolean',
            'birthday'              => "{$opt}|date|before_or_equal:today",
            'notes'                 => "{$opt}|string",
            'device_note'           => "{$opt}|string",
            'do_not_contact'        => ($isStore ? 'nullable|' : 'sometimes|') . 'boolean',
            'do_not_contact_reason' => "{$opt}|string|max:500",
            'preferred_contact_via' => "{$opt}|string|max:100",
            'metadata'              => "{$opt}|array",
            'tags'                  => "{$opt}|array",

            // Multi-contact arrays
            'emails'                   => ($isStore ? 'nullable|' : 'sometimes|nullable|') . 'array',
            'emails.*.value'           => 'required_with:emails|email|max:255',
            'emails.*.label'           => ['nullable', Rule::in(['work', 'home', 'personal', 'other'])],
            'emails.*.is_primary'      => 'nullable|boolean',

            'phones'                   => ($isStore ? 'nullable|' : 'sometimes|nullable|') . 'array',
            'phones.*.value'           => 'required_with:phones|string|max:50',
            'phones.*.label'           => ['nullable', Rule::in(['mobile', 'work', 'home', 'other'])],
            'phones.*.is_primary'      => 'nullable|boolean',

            // Addresses + URLs JSON arrays
            'addresses'                  => "{$opt}|array",
            'addresses.*.label'          => ['nullable', Rule::in(self::ADDRESS_LABELS)],
            'addresses.*.street'         => 'nullable|string|max:255',
            'addresses.*.city'           => 'nullable|string|max:120',
            'addresses.*.region'         => 'nullable|string|max:120',
            'addresses.*.postal_code'    => 'nullable|string|max:30',
            'addresses.*.country'        => 'nullable|string|max:120',

            'urls'                       => "{$opt}|array",
            'urls.*.label'               => ['nullable', Rule::in(self::URL_LABELS)],
            'urls.*.value'               => 'required_with:urls|string|max:500',

            // Social handles + relational metadata
            'instagram_handle'           => "{$opt}|string|max:100",
            'facebook_url'               => "{$opt}|string|max:500|regex:#^https?://(www\\.)?(facebook|fb)\\.com/.+#i",
            'twitter_x_handle'           => "{$opt}|string|max:100",
            'tiktok_handle'              => "{$opt}|string|max:100",
            'whatsapp_phone'             => "{$opt}|string|max:50",
            'previous_employers'         => "{$opt}|array",
            'city'                       => "{$opt}|string|max:150",
            'region'                     => "{$opt}|string|max:150",
            'country'                    => "{$opt}|string|max:100",
            'how_we_met'                 => "{$opt}|string",
            'introduced_by_id'           => array_merge(explode('|', "{$opt}|uuid"), [Rule::exists('people', 'id')->where('user_id', auth()->id())]),
        ];
    }

    /**
     * Strip leading "@" from social handles and digits-only normalize whatsapp_phone
     * before validation so the rules see clean values.
     */
    private function normalizeSocialFields(Request $request): void
    {
        $strip = function (string $key) use ($request) {
            if ($request->has($key)) {
                $v = $request->input($key);
                if (is_string($v)) {
                    $request->merge([$key => ltrim(trim($v), '@')]);
                }
            }
        };
        $strip('instagram_handle');
        $strip('twitter_x_handle');
        $strip('tiktok_handle');

        if ($request->has('whatsapp_phone')) {
            $v = $request->input('whatsapp_phone');
            if (is_string($v)) {
                $digits = preg_replace('/\D+/', '', $v);
                $request->merge(['whatsapp_phone' => $digits ?: null]);
            }
        }
    }

    public function destroy(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $person->delete();
        return response()->json(null, 204);
    }

    public function timeline(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $discussions = $person->discussions()
            ->with(['deal', 'emailThread'])
            ->orderByDesc('date')
            ->get()
            ->map(fn($d) => ['type' => 'discussion', 'date' => $d->date, 'data' => $d]);

        $notes = $person->notes()
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($n) => ['type' => 'note', 'date' => $n->created_at, 'data' => $n]);

        $tasks = $person->tasks()
            ->whereNotNull('completed_at')
            ->orderByDesc('completed_at')
            ->get()
            ->map(fn($t) => ['type' => 'task', 'date' => $t->completed_at, 'data' => $t]);

        $reachOuts = $person->reachOutLogs()
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($r) => ['type' => 'reach_out', 'date' => $r->created_at, 'data' => $r]);

        $timeline = $discussions
            ->merge($notes)
            ->merge($tasks)
            ->merge($reachOuts)
            ->sortByDesc('date')
            ->values();

        return response()->json($timeline);
    }

    public function discussions(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->discussions()->with(['participants', 'deal'])->orderByDesc('date')->get()
        );
    }

    public function deals(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->deals()->with('company')->orderByDesc('created_at')->get()
        );
    }

    public function notes(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->notes()->orderByDesc('created_at')->get()
        );
    }

    public function tasks(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->tasks()->orderBy('due_at')->get()
        );
    }

    /**
     * Quick-log a direct outreach for a person (not gated behind the Today queue).
     * POST /people/{person}/log-contact  { via, note? }
     */
    public function logContact(Request $request, Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $data = $request->validate([
            'via'  => 'required|in:email,phone,sms,imessage,whatsapp,instagram,facebook,in_person,other',
            'note' => 'nullable|string|max:2000',
        ]);

        ReachOutLog::create([
            'user_id'   => auth()->id(),
            'person_id' => $person->id,
            'via'       => $data['via'],
            'reason'    => 'manual',
            'note'      => $data['note'] ?? null,
        ]);

        $person->update(['last_contacted_at' => now()]);
        $person->refresh();

        // Mark any pending cadence schedule items for this person as done.
        ContactScheduleItem::where('user_id', auth()->id())
            ->where('person_id', $person->id)
            ->where('status', 'pending')
            ->update(['status' => 'done']);

        return response()->json([
            'last_contacted_at' => $person->last_contacted_at?->toIso8601String(),
            'next_followup_at'  => $person->next_followup_at?->toIso8601String(),
        ], 201);
    }

    /**
     * People who most need a reach-out, sorted by longest silence first.
     * GET /people/reconnect  ?limit=50&page=1
     */
    public function reconnect(Request $request): JsonResponse
    {
        $cadenceDays = ['none' => null, 'monthly' => 30, 'quarterly' => 90, 'biannual' => 182, 'annual' => 365];

        $people = auth()->user()->people()
            ->with(['company:id,name', 'tags'])
            ->where('do_not_contact', false)
            ->whereNull('deleted_at')
            ->orderByRaw('last_contacted_at IS NOT NULL, last_contacted_at ASC')
            ->paginate((int) $request->get('limit', 50));

        $people->getCollection()->transform(function ($p) use ($cadenceDays) {
            $days = $p->last_contacted_at
                ? (int) now()->diffInDays($p->last_contacted_at)
                : null;
            $target = $cadenceDays[$p->contact_cadence] ?? null;
            $overdue = $target !== null && ($days === null || $days > $target);
            $p->days_since_contact = $days;
            $p->cadence_target_days = $target;
            $p->is_overdue = $overdue;
            $p->overdue_by_days = ($overdue && $days !== null && $target !== null) ? ($days - $target) : null;
            return $p;
        });

        return response()->json($people);
    }

    public function enrich(Request $request): JsonResponse
    {
        $data = $request->validate([
            'linkedin_url' => 'required|url|max:500',
        ]);

        $scraperUrl = rtrim(config('services.scraper.url', ''), '/');
        if (empty($scraperUrl)) {
            return response()->json([
                'message' => 'LinkedIn enrichment service is not configured.',
            ], 503);
        }

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['X-Api-Key'] = $key;
        }

        $response = Http::timeout(45)
            ->withHeaders($headers)
            ->post("{$scraperUrl}/api/enrich", [
                'url' => $data['linkedin_url'],
            ]);

        if ($response->failed()) {
            return response()->json([
                'message' => 'LinkedIn enrichment failed: ' . $response->status(),
            ], 502);
        }

        // Proxy returns { person: {...}, source, model } — unpack the person key.
        $raw = $response->json();
        $p   = $raw['person'] ?? $raw;

        $companyId = null;
        $companyName = data_get($p, 'company.name') ?? $p['company_name'] ?? null;
        if ($companyName) {
            $company = Company::firstOrCreate(
                ['user_id' => auth()->id(), 'name' => $companyName],
                ['user_id' => auth()->id(), 'name' => $companyName]
            );
            $companyId = $company->id;
        }

        $person = Person::create([
            'user_id'               => auth()->id(),
            'first_name'            => $p['first_name'] ?? 'Unknown',
            'last_name'             => $p['last_name'] ?? '',
            'email'                 => $p['email'] ?? null,
            'phone'                 => $p['phone'] ?? null,
            'title'                 => $p['title'] ?? null,
            'avatar_url'            => $p['avatar_url'] ?? null,
            'linkedin_url'          => $p['linkedin_url'] ?? $data['linkedin_url'],
            'company_id'            => $companyId,
            'notes'                 => $p['notes'] ?? null,
            'relationship_strength' => 'cold',
            'metadata'              => [
                'enrichment' => [
                    'source'        => $raw['source'] ?? null,
                    'model'         => $raw['model'] ?? null,
                    'raw_text_used' => $raw['raw_text_used'] ?? null,
                    'location'      => data_get($p, 'metadata.location'),
                    'headline'      => data_get($p, 'metadata.headline'),
                ],
            ],
        ]);

        // Re-host the LinkedIn avatar onto our own storage. LinkedIn CDN URLs
        // (licdn.com) expire and start returning 404/525, so storing the live
        // hotlink leaves broken photos. Download once and serve from our domain.
        if ($rehosted = $this->rehostAvatar($p['avatar_url'] ?? null, $person->id)) {
            if ($rehosted !== $person->avatar_url) {
                $person->update(['avatar_url' => $rehosted]);
            }
        }

        auth()->user()->markOnboarded();

        return response()->json($person->load(['company', 'tags']), 201);
    }

    /**
     * Download a remote avatar (e.g. a LinkedIn CDN URL that will later expire)
     * and store it on our public disk, returning a stable URL on our own
     * domain. Returns the original URL unchanged on any failure, and leaves
     * already-local URLs alone. Requires `php artisan storage:link` and a
     * correct APP_URL.
     */
    private function rehostAvatar(?string $remoteUrl, string $personId): ?string
    {
        if (!$remoteUrl) {
            return null;
        }

        $appUrl = rtrim((string) config('app.url'), '/');
        // Already re-hosted on our domain — don't re-download.
        if ($appUrl !== '' && str_starts_with($remoteUrl, $appUrl)) {
            return $remoteUrl;
        }

        try {
            $resp = Http::timeout(15)->get($remoteUrl);
            if ($resp->failed()) {
                return $remoteUrl;
            }
            $body = $resp->body();
            if (strlen($body) < 100) {
                return $remoteUrl; // too small to be a real image
            }

            $contentType = (string) $resp->header('Content-Type');
            $ext = match (true) {
                str_contains($contentType, 'png')  => 'png',
                str_contains($contentType, 'webp') => 'webp',
                str_contains($contentType, 'gif')  => 'gif',
                default                             => 'jpg',
            };

            $path = "avatars/{$personId}.{$ext}";
            Storage::disk('public')->put($path, $body);

            return ($appUrl !== '' ? $appUrl : '') . '/storage/' . $path;
        } catch (\Throwable) {
            // Fall back to the hotlink; the frontend shows initials if it 404s.
            return $remoteUrl;
        }
    }

    /**
     * Backfill missing avatar_url for every person the user owns that has a
     * linkedin_url but no avatar yet. Hits the enrichment proxy once per
     * contact, saves just the avatar_url (cheap, not the full enrichment),
     * skips on any error so one bad URL doesn't kill the batch.
     *
     * Body: { limit?: int (default 25, max 100) }
     */
    public function backfillAvatars(Request $request): JsonResponse
    {
        $data = $request->validate([
            'limit' => 'nullable|integer|min:1|max:100',
        ]);
        $limit = (int) ($data['limit'] ?? 25);

        $scraperUrl = rtrim(config('services.scraper.url', ''), '/');
        if (empty($scraperUrl)) {
            return response()->json([
                'message' => 'LinkedIn enrichment service is not configured.',
            ], 503);
        }

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['X-Api-Key'] = $key;
        }

        $candidates = Person::where('user_id', auth()->id())
            ->whereNotNull('linkedin_url')
            ->where(function ($q) {
                $q->whereNull('avatar_url')->orWhere('avatar_url', '');
            })
            ->orderBy('updated_at')
            ->limit($limit)
            ->get(['id', 'linkedin_url']);

        $updated = 0;
        $failed  = 0;

        foreach ($candidates as $person) {
            try {
                $response = Http::timeout(30)
                    ->withHeaders($headers)
                    ->post("{$scraperUrl}/api/enrich", ['url' => $person->linkedin_url]);

                if ($response->failed()) { $failed++; continue; }

                $raw = $response->json();
                $p   = $raw['person'] ?? $raw;
                $avatar = $p['avatar_url'] ?? null;
                if (!$avatar) { $failed++; continue; }

                // Re-host onto our domain so the photo doesn't 404/525 later.
                $avatar = $this->rehostAvatar($avatar, $person->id) ?? $avatar;

                Person::where('id', $person->id)->update(['avatar_url' => $avatar]);
                // Also persist as a PersonPhoto so the gallery shows it and
                // the user can swap primaries / add more from there.
                $alreadyHave = \App\Models\PersonPhoto::where('person_id', $person->id)
                    ->where('url', $avatar)
                    ->exists();
                if (!$alreadyHave) {
                    \App\Models\PersonPhoto::create([
                        'id'         => (string) \Illuminate\Support\Str::uuid7(),
                        'person_id'  => $person->id,
                        'url'        => $avatar,
                        'source'     => 'linkedin',
                        'is_primary' => true,
                        'sort_order' => 1,
                    ]);
                    // Demote any previously-primary photo so only one is flagged.
                    \App\Models\PersonPhoto::where('person_id', $person->id)
                        ->where('url', '!=', $avatar)
                        ->update(['is_primary' => false]);
                }
                $updated++;
            } catch (\Throwable) {
                $failed++;
            }
        }

        $remaining = Person::where('user_id', auth()->id())
            ->whereNotNull('linkedin_url')
            ->where(function ($q) {
                $q->whereNull('avatar_url')->orWhere('avatar_url', '');
            })
            ->count();

        return response()->json([
            'updated'   => $updated,
            'failed'    => $failed,
            'remaining' => $remaining,
        ]);
    }

    private function syncTags(Person $person, array $tagNames): void
    {
        $tagIds = collect($tagNames)->map(function (string $name) {
            return \App\Models\Tag::firstOrCreate(
                ['user_id' => auth()->id(), 'slug' => \Illuminate\Support\Str::slug($name)],
                ['user_id' => auth()->id(), 'name' => $name, 'slug' => \Illuminate\Support\Str::slug($name)]
            )->id;
        });

        \DB::table('taggables')
            ->where('taggable_type', Person::class)
            ->where('taggable_id', $person->id)
            ->delete();

        $inserts = $tagIds->map(fn($id) => [
            'tag_id'        => $id,
            'taggable_type' => Person::class,
            'taggable_id'   => $person->id,
        ])->toArray();

        if (!empty($inserts)) {
            \DB::table('taggables')->insert($inserts);
        }
    }
}
