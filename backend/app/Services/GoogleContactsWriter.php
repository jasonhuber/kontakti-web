<?php

namespace App\Services;

use App\Models\{Person, GoogleContactLink, UserGoogleAccount};
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Pushes Kontakti people into Google Contacts via the People API, mirroring the
 * Apple Contacts writeback flow. Postgres/MySQL stays the source of truth; this
 * re-asserts Kontakti's version onto the linked Google contact.
 *
 * Requires the linked Google account to have been consented with the
 * `https://www.googleapis.com/auth/contacts` scope. If the granted token lacks
 * that scope the People API returns 403 and this service throws a clear error
 * the caller surfaces to the user (they must re-connect Google with contacts
 * permission).
 *
 * NOTE: implemented against the documented People API v1 contract but NOT yet
 * verified end-to-end against a live Google account (needs the contacts scope).
 * See QA T8.
 */
class GoogleContactsWriter
{
    private const FIELDS = 'names,emailAddresses,phoneNumbers,organizations,biographies';
    private const BASE = 'https://people.googleapis.com/v1';

    public function __construct(private GoogleTokenManager $tokens) {}

    /**
     * Create or update the Google contact for a person and persist the link.
     */
    public function pushPerson(Person $person, ?UserGoogleAccount $account = null): GoogleContactLink
    {
        $account ??= $this->resolveAccount($person);

        if (!$account) {
            throw new RuntimeException('No Google account is linked to push contacts to.');
        }

        $token = $this->tokens->freshAccessToken($account);

        $existing = GoogleContactLink::where('user_id', $person->user_id)
            ->where('person_id', $person->id)
            ->first();

        $result = $existing
            ? $this->updateContact($token, $existing, $person)
            : $this->createContact($token, $person);

        return GoogleContactLink::updateOrCreate(
            ['user_id' => $person->user_id, 'person_id' => $person->id],
            [
                'resource_name'     => $result['resourceName'],
                'etag'              => $result['etag'] ?? null,
                'google_account_id' => $account->id,
                'account_email'     => $account->email,
                'last_pushed_at'    => now(),
            ]
        );
    }

    private function resolveAccount(Person $person): ?UserGoogleAccount
    {
        return UserGoogleAccount::where('user_id', $person->user_id)
            ->orderByDesc('is_primary')
            ->orderBy('created_at')
            ->first();
    }

    /** @return array{resourceName:string,etag:?string} */
    private function createContact(string $token, Person $person): array
    {
        $resp = Http::withToken($token)
            ->timeout(15)
            ->post(self::BASE . '/people:createContact', $this->buildBody($person));

        $this->assertOk($resp, 'create');
        $body = $resp->json();

        return ['resourceName' => $body['resourceName'], 'etag' => $body['etag'] ?? null];
    }

    /** @return array{resourceName:string,etag:?string} */
    private function updateContact(string $token, GoogleContactLink $link, Person $person): array
    {
        // Fetch the current etag — updateContact rejects a stale one. Re-fetching
        // is also how we avoid clobbering a contact that was changed on Google's
        // side without noticing (we get its latest etag before writing).
        $current = Http::withToken($token)
            ->timeout(15)
            ->get(self::BASE . '/' . $link->resource_name, ['personFields' => 'metadata']);

        // If the contact was deleted on Google's side, recreate it.
        if ($current->status() === 404) {
            return $this->createContact($token, $person);
        }
        $this->assertOk($current, 'fetch');
        $etag = $current->json('etag') ?? $link->etag;

        $payload = $this->buildBody($person) + ['etag' => $etag];

        $resp = Http::withToken($token)
            ->timeout(15)
            ->patch(
                self::BASE . '/' . $link->resource_name . ':updateContact?updatePersonFields=' . self::FIELDS,
                $payload
            );

        $this->assertOk($resp, 'update');
        $body = $resp->json();

        return ['resourceName' => $body['resourceName'] ?? $link->resource_name, 'etag' => $body['etag'] ?? null];
    }

    /**
     * Map a Person onto a People API person resource. Only fields we own.
     */
    private function buildBody(Person $person): array
    {
        $body = [];

        $given  = trim((string) $person->first_name);
        $family = trim((string) $person->last_name);
        if ($given !== '' || $family !== '') {
            $body['names'] = [array_filter([
                'givenName'  => $given ?: null,
                'familyName' => $family ?: null,
            ])];
        }

        if ($email = trim((string) $person->email)) {
            $body['emailAddresses'] = [['value' => $email]];
        }

        if ($phone = trim((string) $person->phone)) {
            $body['phoneNumbers'] = [['value' => $phone]];
        }

        $orgName  = $person->company?->name;
        $orgTitle = trim((string) $person->title);
        if ($orgName || $orgTitle !== '') {
            $body['organizations'] = [array_filter([
                'name'  => $orgName ?: null,
                'title' => $orgTitle ?: null,
            ])];
        }

        if ($notes = trim((string) $person->notes)) {
            $body['biographies'] = [['value' => $notes, 'contentType' => 'TEXT_PLAIN']];
        }

        return $body;
    }

    private function assertOk(\Illuminate\Http\Client\Response $resp, string $op): void
    {
        if ($resp->successful()) {
            return;
        }

        if ($resp->status() === 403) {
            throw new RuntimeException(
                'Google declined the contacts write (403). Re-connect your Google '
                . 'account and grant Contacts permission, then try again.'
            );
        }

        throw new RuntimeException("Google People API {$op} failed: HTTP {$resp->status()} {$resp->body()}");
    }
}
