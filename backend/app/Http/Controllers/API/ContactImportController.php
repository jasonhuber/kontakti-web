<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company};
use Illuminate\Http\{Request, JsonResponse};

class ContactImportController extends Controller
{
    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'contacts'                  => 'required|array|min:1',
            'contacts.*.first_name'     => 'required|string|max:100',
            'contacts.*.last_name'      => 'nullable|string|max:100',
            'contacts.*.email'          => 'nullable|email|max:255',
            'contacts.*.phone'          => 'nullable|string|max:50',
            'contacts.*.company_name'   => 'nullable|string|max:255',
            'contacts.*.source'         => 'nullable|in:device,gmail,google',
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

        foreach ($request->input('contacts') as $contact) {
            $email = isset($contact['email']) ? strtolower(trim($contact['email'])) : null;

            // Skip if a person with this email already exists for this user
            if ($email && isset($existingEmails[$email])) {
                $skipped++;
                continue;
            }

            // Resolve or create company
            $companyId = null;
            if (!empty($contact['company_name'])) {
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
                'last_name'  => $contact['last_name'] ?? '',
                'email'      => $email,
                'phone'      => $contact['phone'] ?? null,
                'company_id' => $companyId,
                'metadata'   => isset($contact['source']) ? ['import_source' => $contact['source']] : null,
            ];

            $person = $user->people()->create($personData);

            // Track the new email so subsequent contacts in same batch are also deduplicated
            if ($email) {
                $existingEmails[$email] = $person->id;
            }

            $people[]  = $person->load('company');
            $imported++;
        }

        return response()->json([
            'imported' => $imported,
            'skipped'  => $skipped,
            'people'   => $people,
        ], 201);
    }
}
