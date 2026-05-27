<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company, PersonEmail};
use App\Services\PersonContactSync;
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Str;

class ContactImportController extends Controller
{
    public function import(Request $request, PersonContactSync $sync): JsonResponse
    {
        $request->validate([
            'contacts'          => 'required|array|min:1',
            'contacts.*'        => 'array',
            'google_account_id' => 'sometimes|integer',
        ]);

        $user      = auth()->user();
        $imported  = 0;
        $skipped   = 0;
        $people    = [];

        // Optional: a Google account id this batch is sourced from. Must belong to the user.
        $googleAccountId = null;
        if ($request->filled('google_account_id')) {
            $candidate = (int) $request->input('google_account_id');
            $belongs = $user->googleAccounts()->whereKey($candidate)->exists();
            if (!$belongs) {
                abort(response()->json([
                    'message' => 'google_account_id does not belong to the authenticated user.',
                ], 422));
            }
            $googleAccountId = $candidate;
        }

        // Pre-load existing emails for this user (legacy column + person_emails table)
        $existingEmails = $user->people()
            ->whereNotNull('email')
            ->pluck('id', 'email')
            ->all();
        $existingEmails = array_change_key_case($existingEmails, CASE_LOWER);

        // Also include every email row in person_emails (any label, any primary flag)
        // so the import respects emails that aren't the legacy primary.
        $extra = PersonEmail::whereIn('person_id', $user->people()->pluck('id'))
            ->get(['person_id', 'value']);
        foreach ($extra as $row) {
            $key = strtolower(trim($row->value));
            if ($key === '') continue;
            if (!isset($existingEmails[$key])) {
                $existingEmails[$key] = $row->person_id;
            }
        }

        foreach ($request->input('contacts') as $rawContact) {
            $contact = $this->normalizeContact($rawContact);

            if (!$contact) {
                $skipped++;
                continue;
            }

            // Build the candidate-email set: legacy single + multi-email array (if any)
            $candidateEmails = [];
            if ($contact['email']) $candidateEmails[] = $contact['email'];
            foreach (($contact['emails'] ?? []) as $e) {
                if (!empty($e['value'])) $candidateEmails[] = strtolower($e['value']);
            }
            $candidateEmails = array_values(array_unique($candidateEmails));

            // Skip if ANY of these emails already exists on another person of this user
            $duplicate = false;
            foreach ($candidateEmails as $em) {
                if (isset($existingEmails[$em])) {
                    $duplicate = true;
                    break;
                }
            }
            if ($duplicate) {
                $skipped++;
                continue;
            }

            // Resolve or create company
            $companyId = null;
            if ($contact['company_name']) {
                $company = $user->companies()
                    ->where('name', $contact['company_name'])
                    ->first();

                if (!$company) {
                    $company = $user->companies()->create([
                        'name' => $contact['company_name'],
                    ]);
                }

                $companyId = $company->id;
            }

            $metadata = [];
            if ($contact['source']) {
                $metadata['import_source'] = $contact['source'];
            }
            if ($googleAccountId !== null) {
                $metadata['google_account_id'] = $googleAccountId;
            }

            $personData = [
                'first_name'            => $contact['first_name'],
                'last_name'             => $contact['last_name'],
                'nickname'              => $contact['nickname'],
                'email'                 => $contact['email'],
                'phone'                 => $contact['phone'],
                'birthday'              => $contact['birthday'],
                'job_department'        => $contact['job_department'],
                'device_note'           => $contact['device_note'],
                'addresses'             => $contact['addresses'] ?? [],
                'urls'                  => $contact['urls'] ?? [],
                'instagram_handle'      => $contact['instagram_handle'] ?? null,
                'facebook_url'          => $contact['facebook_url'] ?? null,
                'whatsapp_phone'        => $contact['whatsapp_phone'] ?? null,
                'company_id'            => $companyId,
                'relationship_strength' => 'cold',
                'metadata'              => $metadata,
            ];

            $person = $user->people()->create($personData);

            // Sync multi-email/phone lists; fallback to legacy single value.
            $emailsArr = $contact['emails'] ?? null;
            if ($emailsArr === null && $contact['email']) {
                $emailsArr = [['value' => $contact['email'], 'label' => 'other', 'is_primary' => true]];
            }
            $phonesArr = $contact['phones'] ?? null;
            if ($phonesArr === null && $contact['phone']) {
                $phonesArr = [['value' => $contact['phone'], 'label' => 'mobile', 'is_primary' => true]];
            }
            if ($emailsArr !== null || $phonesArr !== null) {
                $sync->apply($person, $emailsArr, $phonesArr);
            }

            // Track every new email so subsequent contacts in this batch dedup correctly.
            foreach ($candidateEmails as $em) {
                $existingEmails[$em] = $person->id;
            }

            $people[]  = $person->load(['company.tags', 'tags', 'emails', 'phones']);
            $imported++;
        }

        if ($imported > 0 || $user->people()->exists()) {
            $user->markOnboarded();
        }

        // Post-import dedup: detect candidates → auto-score the trivially
        // identical ones locally (same phone or same email) → auto-merge those
        // so the user never sees the obvious duplicates in their contact list.
        // AI resolution on the genuinely-ambiguous remainder is still deferred
        // to the on-demand "Find duplicates" scan (Cloudflare 100s gateway).
        $duplicateCount = 0;
        $autoMerged     = 0;
        if ($imported > 0) {
            try {
                $detector = app(\App\Services\DuplicateDetector::class);
                $newIds = collect($people)->pluck('id')->all();
                $candidates = $detector->generateCandidates($user, $newIds);
                $duplicateCount = $candidates->count();

                if ($candidates->isNotEmpty()) {
                    $detector->autoScoreIdentical($candidates);
                    // Re-fetch with fresh ai_decision values so mergeAutoScored sees them.
                    $scored = \App\Models\DuplicateCandidate::whereIn('id', $candidates->pluck('id'))
                        ->where('status', 'pending')
                        ->get();
                    $autoMerged = $detector->mergeAutoScored($scored);
                }
            } catch (\Throwable $e) {
                \Log::warning('Post-import dedup failed', ['err' => $e->getMessage()]);
            }
        }

        return response()->json([
            'imported'             => $imported,
            'skipped'              => $skipped,
            'people'               => $people,
            'duplicates_detected'  => $duplicateCount,
            'auto_merged'          => $autoMerged,
        ], 201);
    }

    private function normalizeContact(mixed $contact): ?array
    {
        if (!is_array($contact)) {
            return null;
        }

        // Multi-email array (preferred when present)
        $emailsArr = null;
        if (isset($contact['emails']) && is_array($contact['emails'])) {
            $emailsArr = [];
            foreach ($contact['emails'] as $e) {
                if (!is_array($e)) continue;
                $val = $this->cleanString($e['value'] ?? null, 255);
                if (!$val || !filter_var($val, FILTER_VALIDATE_EMAIL)) continue;
                $label = strtolower((string) ($e['label'] ?? 'other'));
                if (!in_array($label, ['work', 'home', 'personal', 'other'], true)) $label = 'other';
                $emailsArr[] = [
                    'value' => strtolower($val),
                    'label' => $label,
                    'is_primary' => (bool) ($e['is_primary'] ?? false),
                ];
            }
            if (empty($emailsArr)) $emailsArr = null;
        }

        // Legacy single email
        $email = $this->cleanString($contact['email'] ?? null, 255);
        $email = $email && filter_var($email, FILTER_VALIDATE_EMAIL)
            ? strtolower($email)
            : null;

        // If multi-emails present but no legacy primary, derive one from the array.
        if ($emailsArr && !$email) {
            $primary = null;
            foreach ($emailsArr as $e) {
                if ($e['is_primary']) { $primary = $e['value']; break; }
            }
            $email = $primary ?? $emailsArr[0]['value'];
        }

        // Multi-phone array
        $phonesArr = null;
        if (isset($contact['phones']) && is_array($contact['phones'])) {
            $phonesArr = [];
            foreach ($contact['phones'] as $p) {
                if (!is_array($p)) continue;
                $val = $this->cleanString($p['value'] ?? null, 50);
                if (!$val) continue;
                $label = strtolower((string) ($p['label'] ?? 'mobile'));
                if (!in_array($label, ['mobile', 'work', 'home', 'other'], true)) $label = 'mobile';
                $phonesArr[] = [
                    'value' => $val,
                    'label' => $label,
                    'is_primary' => (bool) ($p['is_primary'] ?? false),
                ];
            }
            if (empty($phonesArr)) $phonesArr = null;
        }

        $phone = $this->cleanString($contact['phone'] ?? null, 50);
        if ($phonesArr && !$phone) {
            $primary = null;
            foreach ($phonesArr as $p) {
                if ($p['is_primary']) { $primary = $p['value']; break; }
            }
            $phone = $primary ?? $phonesArr[0]['value'];
        }

        $firstName = $this->cleanString($contact['first_name'] ?? null, 100) ?? '';
        $lastName = $this->cleanString($contact['last_name'] ?? null, 100) ?? '';

        if ($firstName === '' && $lastName !== '') {
            $firstName = $lastName;
            $lastName = '';
        }

        if ($firstName === '' && $email) {
            $firstName = $this->cleanString(Str::headline(Str::before($email, '@')), 100) ?? $email;
        }

        if ($firstName === '' && $phone) {
            $firstName = $phone;
        }

        if ($firstName === '') {
            return null;
        }

        $source = $this->cleanString($contact['source'] ?? null, 20);
        if (!in_array($source, ['device', 'gmail', 'google', 'gmail_personal', 'gmail_work', 'gmail_other'], true)) {
            $source = null;
        }

        // Birthday — accept Y-m-d only
        $birthday = null;
        $rawBday = $contact['birthday'] ?? null;
        if (is_string($rawBday) && $rawBday !== '') {
            try {
                $dt = \DateTime::createFromFormat('Y-m-d', $rawBday);
                if ($dt && $dt->format('Y-m-d') === $rawBday) {
                    $birthday = $rawBday;
                }
            } catch (\Throwable $e) {
                $birthday = null;
            }
        }

        // Addresses — keep only known keys per entry
        $addresses = [];
        if (isset($contact['addresses']) && is_array($contact['addresses'])) {
            foreach ($contact['addresses'] as $a) {
                if (!is_array($a)) continue;
                $label = strtolower((string) ($a['label'] ?? 'other'));
                if (!in_array($label, ['home', 'work', 'other'], true)) $label = 'other';
                $addresses[] = [
                    'label'       => $label,
                    'street'      => $this->cleanString($a['street'] ?? null, 255),
                    'city'        => $this->cleanString($a['city'] ?? null, 120),
                    'region'      => $this->cleanString($a['region'] ?? null, 120),
                    'postal_code' => $this->cleanString($a['postal_code'] ?? null, 30),
                    'country'     => $this->cleanString($a['country'] ?? null, 120),
                ];
            }
        }

        // URLs
        $urls = [];
        if (isset($contact['urls']) && is_array($contact['urls'])) {
            foreach ($contact['urls'] as $u) {
                if (!is_array($u)) continue;
                $value = $this->cleanString($u['value'] ?? null, 500);
                if (!$value) continue;
                $label = strtolower((string) ($u['label'] ?? 'other'));
                if (!in_array($label, ['website', 'linkedin', 'twitter', 'facebook', 'instagram', 'other'], true)) {
                    $label = 'other';
                }
                $urls[] = ['label' => $label, 'value' => $value];
            }
        }

        // Social handles
        $instagram = $this->cleanString($contact['instagram_handle'] ?? null, 100);
        if ($instagram) {
            $instagram = ltrim($instagram, '@');
        }
        $facebookUrl = $this->cleanString($contact['facebook_url'] ?? null, 500);
        if ($facebookUrl && !preg_match('#^https?://(www\.)?(facebook|fb)\.com/.+#i', $facebookUrl)) {
            $facebookUrl = null;
        }
        $whatsapp = $this->cleanString($contact['whatsapp_phone'] ?? null, 50);
        if ($whatsapp) {
            $whatsapp = preg_replace('/\D+/', '', $whatsapp) ?: null;
        }

        return [
            'first_name'       => $firstName,
            'last_name'        => $lastName,
            'nickname'         => $this->cleanString($contact['nickname'] ?? null, 100),
            'email'            => $email,
            'emails'           => $emailsArr,
            'phone'            => $phone,
            'phones'           => $phonesArr,
            'birthday'         => $birthday,
            'job_department'   => $this->cleanString($contact['job_department'] ?? null, 100),
            'device_note'      => $this->cleanString($contact['device_note'] ?? null, 65000),
            'addresses'        => $addresses,
            'urls'             => $urls,
            'company_name'     => $this->cleanString($contact['company_name'] ?? null, 255),
            'source'           => $source,
            'instagram_handle' => $instagram,
            'facebook_url'     => $facebookUrl,
            'whatsapp_phone'   => $whatsapp,
        ];
    }

    private function cleanString(mixed $value, int $maxLength): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        if ($value === '') {
            return null;
        }

        return Str::limit($value, $maxLength, '');
    }
}
