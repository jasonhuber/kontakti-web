<?php

namespace App\Services;

use App\Models\{DuplicateCandidate, Person, User};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\{DB, Http, Log};

class DuplicateDetector
{
    /**
     * Generate pending duplicate candidates for a user using local heuristics.
     *
     * @param  User              $user
     * @param  array<int,string>|null $personIds  When provided, only candidate groups that
     *                                            include at least one of these IDs are kept
     *                                            (post-import scan). Pass null for a full scan.
     * @return Collection<int, DuplicateCandidate>
     */
    public function generateCandidates(User $user, ?array $personIds = null): Collection
    {
        // Pull a working set of all this user's people. For an on-demand scan we
        // need every record; for a post-import scan we still need every record
        // so we can find matches *against* the newly imported ones.
        $people = $user->people()
            ->with(['emails:id,person_id,value', 'phones:id,person_id,value'])
            ->select([
                'id', 'first_name', 'last_name', 'email', 'phone', 'company_id',
                'instagram_handle', 'whatsapp_phone',
            ])
            ->get();

        if ($people->isEmpty()) {
            return collect();
        }

        $filterSet = $personIds ? array_flip($personIds) : null;

        // group_key => sorted array of person ids
        $groups = [];

        $register = function (array $ids) use (&$groups) {
            $ids = array_values(array_unique($ids));
            if (count($ids) < 2) {
                return;
            }
            sort($ids);
            $key = sha1(implode(',', $ids));
            // Merge if we've already seen this key (idempotent), otherwise insert.
            $groups[$key] = $ids;
        };

        // (a) Group by normalized lowercase email (exact match) across all emails
        //     (legacy people.email column + every row in person_emails).
        $byEmail = [];
        foreach ($people as $p) {
            $emailValues = [];
            if ($p->email) $emailValues[] = $p->email;
            foreach ($p->emails as $e) {
                if ($e->value) $emailValues[] = $e->value;
            }
            foreach ($emailValues as $em) {
                $norm = strtolower(trim($em));
                if ($norm === '') continue;
                $byEmail[$norm][$p->id] = $p->id;
            }
        }
        foreach ($byEmail as $ids) {
            $register(array_values($ids));
        }

        // (b) Group by phone normalized to last 10 digits — across all phone rows.
        $byPhone = [];
        foreach ($people as $p) {
            $phoneValues = [];
            if ($p->phone) $phoneValues[] = $p->phone;
            foreach ($p->phones as $ph) {
                if ($ph->value) $phoneValues[] = $ph->value;
            }
            foreach ($phoneValues as $phoneVal) {
                $digits = preg_replace('/\D+/', '', $phoneVal);
                if (strlen($digits) < 7) continue;
                $tail = substr($digits, -10);
                $byPhone[$tail][$p->id] = $p->id;
            }
        }
        foreach ($byPhone as $ids) {
            $register(array_values($ids));
        }

        // (b2) Group by instagram_handle (case-insensitive, @-stripped).
        $byIg = [];
        foreach ($people as $p) {
            $h = $p->instagram_handle;
            if (!$h) continue;
            $norm = strtolower(ltrim(trim($h), '@'));
            if ($norm === '') continue;
            $byIg[$norm][$p->id] = $p->id;
        }
        foreach ($byIg as $ids) {
            $register(array_values($ids));
        }

        // (b3) Group by whatsapp_phone (digits-only).
        $byWhats = [];
        foreach ($people as $p) {
            $w = $p->whatsapp_phone;
            if (!$w) continue;
            $digits = preg_replace('/\D+/', '', $w);
            if (strlen($digits) < 7) continue;
            $byWhats[$digits][$p->id] = $p->id;
        }
        foreach ($byWhats as $ids) {
            $register(array_values($ids));
        }

        // (c) Group by lowercase "first last" name + same company_id.
        // (d) Levenshtein ≤ 2 on full name + same company_id.
        // We bucket by company first to keep both checks cheap.
        $byCompany = [];
        foreach ($people as $p) {
            if (!$p->company_id) continue;
            $byCompany[$p->company_id][] = $p;
        }

        foreach ($byCompany as $companyId => $rows) {
            if (count($rows) < 2) continue;

            // (c) exact normalized full name match within same company
            $byName = [];
            foreach ($rows as $p) {
                $name = strtolower(trim(($p->first_name ?? '') . ' ' . ($p->last_name ?? '')));
                $name = preg_replace('/\s+/', ' ', $name);
                if ($name === '') continue;
                $byName[$name][] = $p->id;
            }
            foreach ($byName as $ids) {
                $register($ids);
            }

            // (d) levenshtein ≤ 2 on full name within same company (pairwise).
            $normalised = [];
            foreach ($rows as $p) {
                $name = strtolower(trim(($p->first_name ?? '') . ' ' . ($p->last_name ?? '')));
                $name = preg_replace('/\s+/', ' ', $name);
                if ($name === '') continue;
                $normalised[] = ['id' => $p->id, 'name' => $name];
            }
            $count = count($normalised);
            for ($i = 0; $i < $count; $i++) {
                for ($j = $i + 1; $j < $count; $j++) {
                    $a = $normalised[$i]['name'];
                    $b = $normalised[$j]['name'];
                    if ($a === $b) continue; // already handled by (c)
                    // levenshtein in PHP is limited to 255 chars on each input.
                    if (strlen($a) > 255 || strlen($b) > 255) continue;
                    // Quick length pre-filter.
                    if (abs(strlen($a) - strlen($b)) > 2) continue;
                    if (levenshtein($a, $b) <= 2) {
                        $register([$normalised[$i]['id'], $normalised[$j]['id']]);
                    }
                }
            }
        }

        if (empty($groups)) {
            return collect();
        }

        // Filter to groups that include at least one $personIds entry, if requested.
        if ($filterSet !== null) {
            $groups = array_filter($groups, function ($ids) use ($filterSet) {
                foreach ($ids as $id) {
                    if (isset($filterSet[$id])) return true;
                }
                return false;
            });
        }

        if (empty($groups)) {
            return collect();
        }

        // Skip groups that already have a non-pending row for this user.
        $existing = DuplicateCandidate::where('user_id', $user->id)
            ->whereIn('group_key', array_keys($groups))
            ->get(['group_key', 'status', 'id']);

        $blocked = [];
        $existingByKey = [];
        foreach ($existing as $row) {
            $existingByKey[$row->group_key] = $row;
            if ($row->status !== 'pending') {
                $blocked[$row->group_key] = true;
            }
        }

        $now = now();
        $resultIds = [];

        foreach ($groups as $key => $ids) {
            if (isset($blocked[$key])) continue;

            if (isset($existingByKey[$key])) {
                // Already pending — keep as-is, just include it.
                $resultIds[] = $existingByKey[$key]->id;
                continue;
            }

            $row = DuplicateCandidate::create([
                'user_id'    => $user->id,
                'group_key'  => $key,
                'person_ids' => $ids,
                'status'     => 'pending',
            ]);
            $resultIds[] = $row->id;
        }

        if (empty($resultIds)) {
            return collect();
        }

        return DuplicateCandidate::whereIn('id', $resultIds)->get();
    }

    /**
     * Local pre-pass: any candidate whose contacts share the same normalised
     * phone OR email gets an immediate "merge" verdict without burning an AI
     * call. This catches the trivially-identical cases (same person imported
     * twice with a typo / nickname / formatting difference) so the UI shows a
     * confident green "Merge" badge and bulk-merge has a populated
     * `ai_decision.merged` to work from.
     *
     * Returns the set of candidate IDs that got auto-scored (so the caller
     * can skip them when calling the external proxy).
     *
     * @param  Collection<int, DuplicateCandidate> $candidates
     * @return array<int, true>  Map of candidate IDs that were auto-scored.
     */
    public function autoScoreIdentical(Collection $candidates): array
    {
        $pending = $candidates->filter(
            fn($c) => $c->status === 'pending' && $c->ai_decision === null
        )->values();

        if ($pending->isEmpty()) return [];

        $allIds = [];
        foreach ($pending as $c) {
            foreach (($c->person_ids ?? []) as $pid) $allIds[$pid] = true;
        }
        if (empty($allIds)) return [];

        $userId = $pending->first()->user_id;
        $people = Person::whereIn('id', array_keys($allIds))
            ->where('user_id', $userId)
            ->with(['company:id,name', 'phones:id,person_id,value', 'emails:id,person_id,value'])
            ->get()
            ->keyBy('id');

        $normPhone = function (?string $p) {
            $d = preg_replace('/\D/', '', (string) $p);
            if (strlen($d) === 11 && str_starts_with($d, '1')) $d = substr($d, 1);
            return $d;
        };

        // Build the set of all normalised phones/emails a contact owns: the
        // legacy single-column value plus every row in person_phones /
        // person_emails. A contact can have multiple of either.
        $phonesOf = function (Person $p) use ($normPhone): array {
            $set = [];
            if ($n = $normPhone($p->phone)) $set[$n] = true;
            foreach ($p->phones as $ph) {
                if ($n = $normPhone($ph->value)) $set[$n] = true;
            }
            return $set;
        };
        $emailsOf = function (Person $p): array {
            $set = [];
            $main = strtolower(trim((string) ($p->email ?? '')));
            if ($main !== '') $set[$main] = true;
            foreach ($p->emails as $e) {
                $v = strtolower(trim((string) ($e->value ?? '')));
                if ($v !== '') $set[$v] = true;
            }
            return $set;
        };

        $scored = [];

        foreach ($pending as $c) {
            $group = collect($c->person_ids ?? [])->map(fn($id) => $people->get($id))->filter()->values();
            if ($group->count() < 2) continue;

            // Intersect each contact's phone-set / email-set. A non-empty
            // intersection means every contact in the group owns at least one
            // common phone (or email) — strong "same person" signal even
            // when one contact has multiple numbers and another has just one.
            $phoneSets = $group->map($phonesOf);
            $emailSets = $group->map($emailsOf);

            $phoneIntersection = array_keys($phoneSets->reduce(
                fn($acc, $s) => $acc === null ? $s : array_intersect_key($acc, $s),
                null,
            ) ?? []);
            $emailIntersection = array_keys($emailSets->reduce(
                fn($acc, $s) => $acc === null ? $s : array_intersect_key($acc, $s),
                null,
            ) ?? []);

            $sharedPhone = !empty($phoneIntersection);
            $sharedEmail = !empty($emailIntersection);

            // Third signal: same normalised name + same company. Two contacts
            // with the same first+last name at the same company are virtually
            // always the same person — they just happen to have separate
            // numbers (work + personal, old + new). All their phones/emails
            // get carried forward by the merge below.
            $normalise = fn(?string $s) => preg_replace('/\s+/', ' ', strtolower(trim((string) $s)));
            $firstNames = $group->map(fn($p) => $normalise($p->first_name))->unique();
            $lastNames  = $group->map(fn($p) => $normalise($p->last_name))->unique();
            $companyIds = $group->map(fn($p) => $p->company_id)->unique();

            $sameName     = $firstNames->count() === 1 && $firstNames->first() !== ''
                         && $lastNames->count() === 1; // last names can both be empty — that's still "same"
            $sameCompany  = $companyIds->count() === 1 && $companyIds->first() !== null;
            $sameNameAndCompany = $sameName && $sameCompany;

            if (!$sharedPhone && !$sharedEmail && !$sameNameAndCompany) continue;

            // Pick richest contact as primary.
            $primary = $group->sortByDesc(function ($p) {
                return (int) (bool) $p->email
                    + (int) (bool) $p->phone
                    + (int) (bool) $p->company_id
                    + (int) (bool) $p->title
                    + (int) (bool) $p->linkedin_url
                    + (int) (bool) $p->first_name
                    + (int) (bool) $p->last_name;
            })->first();

            // Pick first non-empty value across the group, preferring clean
            // name fields (no `@`) and longer non-empty strings. For phone /
            // email also fall back to the relation rows so a primary with an
            // empty legacy column still gets a sensible default.
            $pick = function (string $field) use ($primary, $group) {
                $order = collect([$primary])->merge($group->where('id', '!=', $primary->id));
                $vals = $order->map(function ($p) use ($field) {
                    if ($field === 'company_name') return $p->company?->name;
                    $v = $p->{$field} ?? null;
                    if (is_string($v) && trim($v) !== '') return $v;
                    if ($field === 'phone') {
                        $first = $p->phones->first(fn($ph) => is_string($ph->value) && trim($ph->value) !== '');
                        return $first?->value;
                    }
                    if ($field === 'email') {
                        $first = $p->emails->first(fn($e) => is_string($e->value) && trim($e->value) !== '');
                        return $first?->value;
                    }
                    return null;
                })->filter(fn($v) => is_string($v) && trim($v) !== '')->values();
                if ($vals->isEmpty()) return '';
                if (in_array($field, ['first_name', 'last_name'], true)) {
                    $clean = $vals->filter(fn($v) => !str_contains($v, '@'))->values();
                    if ($clean->isNotEmpty()) {
                        return $clean->sortByDesc(fn($v) => strlen($v))->first();
                    }
                }
                return $vals->first();
            };

            if ($sharedPhone && $sharedEmail) {
                $reason = 'Identical contact data — same phone and email.';
            } elseif ($sharedPhone) {
                $reason = 'Identical contact data — same phone number.';
            } elseif ($sharedEmail) {
                $reason = 'Identical contact data — same email address.';
            } else {
                $reason = 'Same name at the same company — phones and emails combined.';
            }

            $c->ai_decision = [
                'id'         => $c->group_key,
                'decision'   => 'merge',
                'confidence' => 1.0,
                'primary_id' => $primary->id,
                'reasoning'  => $reason,
                'merged'     => [
                    'first_name'   => $pick('first_name'),
                    'last_name'    => $pick('last_name'),
                    'email'        => $pick('email'),
                    'phone'        => $pick('phone'),
                    'company_name' => $pick('company_name'),
                ],
            ];
            $c->ai_confidence = 1.0;
            $c->save();

            $scored[$c->id] = true;
        }

        return $scored;
    }

    /**
     * Sweep pending candidates whose referenced people have already been
     * soft-deleted (fewer than 2 alive). These are leftovers from prior merges
     * where the *same* person appeared in multiple overlapping candidate
     * groups — once one group is merged, the others become orphans. Marking
     * them as 'merged' (the people are, effectively, already merged) clears
     * the "0 contacts" cards that the user can't act on.
     *
     * Returns the number of orphan rows resolved.
     */
    public function cleanupOrphans(int $userId): int
    {
        $rows = DuplicateCandidate::where('user_id', $userId)
            ->where('status', 'pending')
            ->get(['id', 'person_ids']);

        if ($rows->isEmpty()) return 0;

        $allIds = $rows->flatMap(fn($r) => $r->person_ids ?? [])->unique()->values()->all();
        if (empty($allIds)) return 0;

        $aliveIds = Person::whereIn('id', $allIds)
            ->where('user_id', $userId)
            ->pluck('id')
            ->all();
        $aliveSet = array_flip($aliveIds);

        $toResolve = [];
        foreach ($rows as $r) {
            $alive = 0;
            foreach (($r->person_ids ?? []) as $pid) {
                if (isset($aliveSet[$pid])) $alive++;
            }
            if ($alive < 2) $toResolve[] = $r->id;
        }

        if (empty($toResolve)) return 0;

        DuplicateCandidate::whereIn('id', $toResolve)->update([
            'status'      => 'merged',
            'reviewed_at' => now(),
        ]);

        return count($toResolve);
    }

    /**
     * Walk a set of auto-scored "merge" candidates and actually merge each one.
     * Returns the number successfully merged. Failures are logged and skipped
     * so a single bad group doesn't poison the whole batch.
     *
     * @param  Collection<int, DuplicateCandidate> $candidates
     */
    public function mergeAutoScored(Collection $candidates): int
    {
        $merged = 0;
        $userId = null;
        foreach ($candidates as $c) {
            $userId ??= $c->user_id;
            if ($c->status !== 'pending') continue;
            $decision = $c->ai_decision;
            if (!is_array($decision) || ($decision['decision'] ?? null) !== 'merge') continue;

            $primaryId = $decision['primary_id'] ?? null;
            $mergedFields = $decision['merged'] ?? null;
            if (!$primaryId || !is_array($mergedFields)) continue;

            try {
                $this->mergeCandidate($c, $primaryId, $mergedFields);
                $merged++;
            } catch (\Throwable $e) {
                Log::warning('mergeAutoScored failed', [
                    'candidate_id' => $c->id,
                    'group_key'    => $c->group_key,
                    'error'        => $e->getMessage(),
                ]);
            }
        }

        // Once we've collapsed groups, overlapping candidate rows become
        // orphans (their other people are gone). Sweep them so the user
        // doesn't see "0 contacts" cards on the next list refresh.
        if ($merged > 0 && $userId !== null) {
            $this->cleanupOrphans($userId);
        }

        return $merged;
    }

    /**
     * Send all pending candidates in one batch to the dedupe proxy and persist
     * the AI decisions.
     */
    public function resolveWithAI(Collection $candidates): void
    {
        if ($candidates->isEmpty()) return;

        // Local pre-pass: score trivially identical groups (same phone/email)
        // without an AI call. These no longer need to go through the proxy.
        $autoScored = $this->autoScoreIdentical($candidates);

        $scraperUrl = rtrim((string) config('services.scraper.url', ''), '/');
        if ($scraperUrl === '') {
            // Proxy not configured: anything not auto-scored stays null and
            // remains reviewable manually.
            return;
        }

        // Re-fetch pending only — defensive in case caller passed mixed status.
        // Skip ones we already scored locally so we don't waste proxy budget.
        $pending = $candidates
            ->filter(fn($c) => $c->status === 'pending' && !isset($autoScored[$c->id]))
            ->values();
        if ($pending->isEmpty()) return;

        // Collect all person IDs to fetch in one query.
        $allIds = [];
        foreach ($pending as $c) {
            foreach (($c->person_ids ?? []) as $pid) $allIds[$pid] = true;
        }
        $userId = $pending->first()->user_id;
        $people = Person::whereIn('id', array_keys($allIds))
            ->where('user_id', $userId)
            ->with(['company:id,name', 'emails', 'phones'])
            ->get()
            ->keyBy('id');

        $groups = [];
        foreach ($pending as $c) {
            $contacts = [];
            foreach (($c->person_ids ?? []) as $pid) {
                $p = $people->get($pid);
                if (!$p) continue;
                $contacts[] = [
                    'id'               => $p->id,
                    'first_name'       => $p->first_name,
                    'last_name'        => $p->last_name,
                    'email'            => $p->email,
                    'phone'            => $p->phone,
                    'emails'           => $p->emails->map(fn($e) => [
                        'value'      => $e->value,
                        'label'      => $e->label,
                        'is_primary' => (bool) $e->is_primary,
                    ])->all(),
                    'phones'           => $p->phones->map(fn($ph) => [
                        'value'      => $ph->value,
                        'label'      => $ph->label,
                        'is_primary' => (bool) $ph->is_primary,
                    ])->all(),
                    'company_name'     => $p->company?->name,
                    'instagram_handle' => $p->instagram_handle,
                    'facebook_url'     => $p->facebook_url,
                    'twitter_x_handle' => $p->twitter_x_handle,
                    'tiktok_handle'    => $p->tiktok_handle,
                    'whatsapp_phone'   => $p->whatsapp_phone,
                    'linkedin_url'     => $p->linkedin_url,
                ];
            }
            if (count($contacts) < 2) continue;
            $groups[] = [
                'id'       => $c->group_key,
                'contacts' => $contacts,
            ];
        }

        if (empty($groups)) return;

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['X-Api-Key'] = $key;
        }

        try {
            $response = Http::timeout(120)
                ->withHeaders($headers)
                ->post("{$scraperUrl}/api/dedupe", ['groups' => $groups]);

            if ($response->failed()) {
                Log::warning('Dedupe proxy returned non-2xx', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                return;
            }

            $payload = $response->json();
            $returned = $payload['groups'] ?? [];

            $byKey = $pending->keyBy('group_key');
            foreach ($returned as $g) {
                $key = $g['id'] ?? null;
                if (!$key) continue;
                $candidate = $byKey->get($key);
                if (!$candidate) continue;
                $candidate->ai_decision   = $g;
                $candidate->ai_confidence = isset($g['confidence']) ? (float) $g['confidence'] : null;
                $candidate->save();
            }
        } catch (\Throwable $e) {
            Log::warning('Dedupe proxy call failed', ['err' => $e->getMessage()]);
        }
    }

    /**
     * Merge a duplicate candidate into a single primary Person.
     *
     * @param  DuplicateCandidate $candidate
     * @param  string             $primaryId      The Person id to keep.
     * @param  array              $mergedFields   Fields to apply to the primary.
     * @return Person
     */
    public function mergeCandidate(DuplicateCandidate $candidate, string $primaryId, array $mergedFields): Person
    {
        $userId = $candidate->user_id;
        $personIds = $candidate->person_ids ?? [];

        if (!in_array($primaryId, $personIds, true)) {
            throw new \InvalidArgumentException('primary_id is not part of this candidate group');
        }

        return DB::transaction(function () use ($candidate, $primaryId, $mergedFields, $userId, $personIds) {
            /** @var \Illuminate\Support\Collection<string,Person> $people */
            $people = Person::whereIn('id', $personIds)
                ->where('user_id', $userId)
                ->get()
                ->keyBy('id');

            // Orphan candidate: all referenced people were already merged
            // (soft-deleted) by an overlapping merge. Nothing to do — mark
            // this row resolved and return any surviving primary so callers
            // get a usable Person back.
            if ($people->count() < 2) {
                $candidate->status      = 'merged';
                $candidate->reviewed_at = now();
                $candidate->save();
                $survivor = $people->first()
                    ?? Person::where('user_id', $userId)->find($primaryId);
                if ($survivor) return $survivor;
                throw new \RuntimeException('Candidate has no surviving people');
            }

            /** @var Person $primary */
            $primary = $people->get($primaryId);
            if (!$primary) {
                // Primary was soft-deleted but at least one sibling survives.
                // Use that sibling so the merge can still complete cleanly.
                $primary = $people->first();
            }

            // Apply merged fields (only known, safe columns).
            $allowed = ['first_name', 'last_name', 'email', 'phone', 'company_name'];
            $update  = [];
            foreach ($allowed as $f) {
                if (!array_key_exists($f, $mergedFields)) continue;
                $val = $mergedFields[$f];
                if ($val === '' || $val === null) continue;
                if ($f === 'company_name') {
                    // Resolve or create a company for this user. Use a direct
                    // query against Company — Person has no `user` relation,
                    // and `$primary->user->companies()` would crash with a
                    // "Call to a member function companies() on null" error.
                    $companyName = trim((string) $val);
                    if ($companyName === '') continue;
                    $company = \App\Models\Company::where('user_id', $userId)
                        ->where('name', $companyName)
                        ->first();
                    if (!$company) {
                        $company = \App\Models\Company::create([
                            'user_id' => $userId,
                            'name'    => $companyName,
                        ]);
                    }
                    $update['company_id'] = $company->id;
                } else {
                    $update[$f] = $val;
                }
            }
            if (!empty($update)) {
                $primary->fill($update)->save();
            }

            $personType = Person::class; // App\Models\Person

            // Phone normaliser shared by the person_phones move below.
            $normPhone = function (?string $p): string {
                $d = preg_replace('/\D/', '', (string) $p);
                if (strlen($d) === 11 && str_starts_with($d, '1')) $d = substr($d, 1);
                return $d;
            };

            foreach ($people as $id => $other) {
                if ($id === $primaryId) continue;

                // person_phones — carry forward every distinct number from the
                // sibling onto the primary. Without this, secondary numbers
                // get orphaned on the soft-deleted person and disappear from
                // the merged contact.
                $primaryPhoneRows = DB::table('person_phones')
                    ->where('person_id', $primaryId)
                    ->get(['id', 'value']);
                $primaryNormSet = [];
                foreach ($primaryPhoneRows as $r) {
                    $primaryNormSet[$normPhone($r->value)] = true;
                }
                // Also count the legacy column so we don't add a row that
                // duplicates it.
                if ($n = $normPhone($primary->phone)) {
                    $primaryNormSet[$n] = true;
                }

                $otherPhoneRows = DB::table('person_phones')
                    ->where('person_id', $id)
                    ->get(['id', 'value']);
                foreach ($otherPhoneRows as $row) {
                    $n = $normPhone($row->value);
                    if ($n === '' || isset($primaryNormSet[$n])) {
                        DB::table('person_phones')->where('id', $row->id)->delete();
                    } else {
                        DB::table('person_phones')
                            ->where('id', $row->id)
                            ->update(['person_id' => $primaryId]);
                        $primaryNormSet[$n] = true;
                    }
                }

                // person_emails — same idea, deduped by lower-cased value.
                $primaryEmailRows = DB::table('person_emails')
                    ->where('person_id', $primaryId)
                    ->get(['id', 'value']);
                $primaryEmailSet = [];
                foreach ($primaryEmailRows as $r) {
                    $v = strtolower(trim((string) $r->value));
                    if ($v !== '') $primaryEmailSet[$v] = true;
                }
                if ($primary->email) {
                    $primaryEmailSet[strtolower(trim($primary->email))] = true;
                }

                $otherEmailRows = DB::table('person_emails')
                    ->where('person_id', $id)
                    ->get(['id', 'value']);
                foreach ($otherEmailRows as $row) {
                    $v = strtolower(trim((string) $row->value));
                    if ($v === '' || isset($primaryEmailSet[$v])) {
                        DB::table('person_emails')->where('id', $row->id)->delete();
                    } else {
                        DB::table('person_emails')
                            ->where('id', $row->id)
                            ->update(['person_id' => $primaryId]);
                        $primaryEmailSet[$v] = true;
                    }
                }

                // discussion_people pivot (UNIQUE on (discussion_id, person_id)).
                // For each row where person_id = $id, point it at $primaryId,
                // but skip cases where the primary already participates.
                $existingPivots = DB::table('discussion_people')
                    ->where('person_id', $primaryId)
                    ->pluck('discussion_id')
                    ->all();
                $existingSet = array_flip($existingPivots);

                $toMove = DB::table('discussion_people')
                    ->where('person_id', $id)
                    ->pluck('discussion_id')
                    ->all();

                foreach ($toMove as $did) {
                    if (isset($existingSet[$did])) {
                        DB::table('discussion_people')
                            ->where('discussion_id', $did)
                            ->where('person_id', $id)
                            ->delete();
                    } else {
                        DB::table('discussion_people')
                            ->where('discussion_id', $did)
                            ->where('person_id', $id)
                            ->update(['person_id' => $primaryId]);
                        $existingSet[$did] = true;
                    }
                }

                // deal_contacts pivot (PK on (deal_id, person_id)).
                $existingDeals = DB::table('deal_contacts')
                    ->where('person_id', $primaryId)
                    ->pluck('deal_id')
                    ->all();
                $existingDealSet = array_flip($existingDeals);

                $otherDeals = DB::table('deal_contacts')
                    ->where('person_id', $id)
                    ->pluck('deal_id')
                    ->all();

                foreach ($otherDeals as $dealId) {
                    if (isset($existingDealSet[$dealId])) {
                        DB::table('deal_contacts')
                            ->where('deal_id', $dealId)
                            ->where('person_id', $id)
                            ->delete();
                    } else {
                        DB::table('deal_contacts')
                            ->where('deal_id', $dealId)
                            ->where('person_id', $id)
                            ->update(['person_id' => $primaryId]);
                        $existingDealSet[$dealId] = true;
                    }
                }

                // notes (polymorphic).
                DB::table('notes')
                    ->where('notable_type', $personType)
                    ->where('notable_id', $id)
                    ->update(['notable_id' => $primaryId]);

                // tasks (polymorphic).
                DB::table('tasks')
                    ->where('taskable_type', $personType)
                    ->where('taskable_id', $id)
                    ->update(['taskable_id' => $primaryId]);

                // entity_links — both endpoints.
                DB::table('entity_links')
                    ->where('source_type', $personType)
                    ->where('source_id', $id)
                    ->update(['source_id' => $primaryId]);
                DB::table('entity_links')
                    ->where('target_type', $personType)
                    ->where('target_id', $id)
                    ->update(['target_id' => $primaryId]);

                // activity_feed — subject and object.
                DB::table('activity_feed')
                    ->where('subject_type', $personType)
                    ->where('subject_id', $id)
                    ->update(['subject_id' => $primaryId]);
                DB::table('activity_feed')
                    ->where('object_type', $personType)
                    ->where('object_id', $id)
                    ->update(['object_id' => $primaryId]);

                // person_photos — carry the sibling's photos onto the primary so
                // they aren't orphaned on the soft-deleted person. Primary-flag
                // is normalised after the loop.
                DB::table('person_photos')
                    ->where('person_id', $id)
                    ->update(['person_id' => $primaryId]);

                // apple_contact_links — UNIQUE (user_id, person_id). If the
                // primary is already linked to an Apple contact, keep that link
                // and drop the sibling's; otherwise move the sibling's link onto
                // the primary so Apple writeback keeps working post-merge.
                $primaryHasLink = DB::table('apple_contact_links')
                    ->where('user_id', $userId)
                    ->where('person_id', $primaryId)
                    ->exists();
                if ($primaryHasLink) {
                    DB::table('apple_contact_links')
                        ->where('user_id', $userId)
                        ->where('person_id', $id)
                        ->delete();
                } else {
                    DB::table('apple_contact_links')
                        ->where('user_id', $userId)
                        ->where('person_id', $id)
                        ->update(['person_id' => $primaryId]);
                }

                // Soft-delete the non-primary person (Person uses SoftDeletes).
                $other->delete();
            }

            // Normalise photo primaries: after merging, the survivor may have
            // several photos flagged primary. Keep the lowest sort_order one.
            $primaryPhotoIds = DB::table('person_photos')
                ->where('person_id', $primaryId)
                ->where('is_primary', true)
                ->orderBy('sort_order')
                ->pluck('id');
            if ($primaryPhotoIds->count() > 1) {
                DB::table('person_photos')
                    ->where('person_id', $primaryId)
                    ->where('id', '!=', $primaryPhotoIds->first())
                    ->update(['is_primary' => false]);
            }

            $candidate->status      = 'merged';
            $candidate->reviewed_at = now();
            $candidate->save();

            return $primary->refresh();
        });
    }

    public function dismissCandidate(DuplicateCandidate $candidate, string $reason = 'kept_separate'): void
    {
        $status = in_array($reason, ['dismissed', 'kept_separate'], true) ? $reason : 'kept_separate';
        $candidate->status      = $status;
        $candidate->reviewed_at = now();
        $candidate->save();
    }
}
