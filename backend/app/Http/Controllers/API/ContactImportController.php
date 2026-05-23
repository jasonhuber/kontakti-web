<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company};
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Str;

class ContactImportController extends Controller
{
    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'contacts'   => 'required|array|min:1',
            'contacts.*' => 'array',
        ]);

        $user      = auth()->user();
        $imported  = 0;
        $skipped   = 0;
        $people    = [];

        // Pre-load existing emails for this user to avoid N+1 duplicate checks
        $existingEmails = $user->people()
            ->whereNotNull('email')
            ->pluck('id', 'email')
            ->all();

        foreach ($request->input('contacts') as $rawContact) {
            $contact = $this->normalizeContact($rawContact);

            if (!$contact) {
                $skipped++;
                continue;
            }

            $email = $contact['email'];

            // Skip if a person with this email already exists for this user
            if ($email && isset($existingEmails[$email])) {
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

            $personData = [
                'first_name' => $contact['first_name'],
                'last_name'  => $contact['last_name'],
                'email'      => $email,
                'phone'      => $contact['phone'],
                'company_id' => $companyId,
                'metadata'   => $contact['source'] ? ['import_source' => $contact['source']] : [],
            ];

            $person = $user->people()->create($personData);

            // Track the new email so subsequent contacts in same batch are also deduplicated
            if ($email) {
                $existingEmails[$email] = $person->id;
            }

            $people[]  = $person->load(['company', 'tags']);
            $imported++;
        }

        if ($imported > 0 || $user->people()->exists()) {
            $user->markOnboarded();
        }

        return response()->json([
            'imported' => $imported,
            'skipped'  => $skipped,
            'people'   => $people,
        ], 201);
    }

    private function normalizeContact(mixed $contact): ?array
    {
        if (!is_array($contact)) {
            return null;
        }

        $email = $this->cleanString($contact['email'] ?? null, 255);
        $email = $email && filter_var($email, FILTER_VALIDATE_EMAIL)
            ? strtolower($email)
            : null;

        $phone = $this->cleanString($contact['phone'] ?? null, 50);
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
        if (!in_array($source, ['device', 'gmail', 'google'], true)) {
            $source = null;
        }

        return [
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'phone' => $phone,
            'company_name' => $this->cleanString($contact['company_name'] ?? null, 255),
            'source' => $source,
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
