<?php

namespace App\Services;

use App\Models\{Discussion, EmailThread, Person, PersonEmail, UserGoogleAccount};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{Http, Log};
use Illuminate\Support\Str;

/**
 * Pulls recent Gmail threads for a linked Google account, upserts an
 * email_threads row per thread, and — when at least one participant matches
 * an existing person_emails row for that user — creates a Discussion record
 * tagged with the matched participants. We do not auto-create new people from
 * email (too noisy); unmatched threads are still persisted for later use.
 */
class GmailSyncService
{
    public const GMAIL_LIST_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/threads';

    public function __construct(private GoogleTokenManager $tokens)
    {
    }

    /**
     * @return array{synced:int, discussions_created:int, errors:int}
     */
    public function syncForAccount(UserGoogleAccount $account, int $limit = 50): array
    {
        $result = ['synced' => 0, 'discussions_created' => 0, 'errors' => 0];

        try {
            $accessToken = $this->tokens->freshAccessToken($account);
        } catch (\Throwable $e) {
            Log::warning('GmailSync: cannot mint access token', [
                'account_id' => $account->id,
                'err'        => $e->getMessage(),
            ]);
            $result['errors']++;
            return $result;
        }

        try {
            $listResponse = Http::withToken($accessToken)
                ->timeout(30)
                ->get(self::GMAIL_LIST_URL, [
                    'maxResults' => $limit,
                    'q'          => 'newer_than:30d',
                ]);
        } catch (\Throwable $e) {
            Log::warning('GmailSync: thread list transport failed', [
                'account_id' => $account->id,
                'err'        => $e->getMessage(),
            ]);
            $result['errors']++;
            return $result;
        }

        if (!$listResponse->ok()) {
            Log::warning('GmailSync: thread list non-2xx', [
                'account_id' => $account->id,
                'status'     => $listResponse->status(),
            ]);
            $result['errors']++;
            return $result;
        }

        $threads = $listResponse->json('threads') ?? [];

        // Pre-load every email address for this user for fast matching.
        $emailToPerson = PersonEmail::query()
            ->whereIn('person_id', function ($q) use ($account) {
                $q->select('id')->from('people')->where('user_id', $account->user_id);
            })
            ->get()
            ->mapWithKeys(fn ($e) => [strtolower($e->value) => $e->person_id])
            ->all();

        $ownerEmail = strtolower($account->email);

        foreach ($threads as $threadStub) {
            $threadId = $threadStub['id'] ?? null;
            if (!$threadId) continue;

            try {
                $detail = $this->fetchThread($accessToken, $threadId);
                if ($detail === null) {
                    $result['errors']++;
                    continue;
                }

                $existing = EmailThread::where('user_google_account_id', $account->id)
                    ->where('gmail_thread_id', $threadId)
                    ->first();

                if ($existing) {
                    $existing->forceFill(['synced_at' => now()])->save();
                    $result['synced']++;
                    continue;
                }

                $parsed = $this->parseThreadMessages($detail);

                // Match every participant email (other than the account's own
                // address) against the user's person_emails.
                $matchedPersonIds = [];
                foreach ($parsed['participants'] as $email) {
                    $lower = strtolower($email);
                    if ($lower === $ownerEmail) continue;
                    if (isset($emailToPerson[$lower])) {
                        $matchedPersonIds[$emailToPerson[$lower]] = true;
                    }
                }
                $matchedPersonIds = array_keys($matchedPersonIds);

                $discussionId = null;

                if (!empty($matchedPersonIds)) {
                    $discussion = Discussion::create([
                        'user_id' => $account->user_id,
                        'title'   => $parsed['subject'] ?: '(no subject)',
                        'date'    => $parsed['last_message_at'] ?? now(),
                        'type'    => 'email',
                        'summary' => trim(($parsed['subject'] ?: '') . ' — ' . Str::limit($parsed['snippet'] ?? '', 200)),
                        'metadata' => [
                            'gmail_thread_id'        => $threadId,
                            'user_google_account_id' => $account->id,
                        ],
                    ]);
                    $discussion->participants()->attach($matchedPersonIds);

                    // Bump last_contacted_at for each matched person.
                    Person::whereIn('id', $matchedPersonIds)
                        ->where(function ($q) use ($parsed) {
                            $q->whereNull('last_contacted_at')
                              ->orWhere('last_contacted_at', '<', $parsed['last_message_at']);
                        })
                        ->update(['last_contacted_at' => $parsed['last_message_at']]);

                    $discussionId = $discussion->id;
                    $result['discussions_created']++;
                }

                EmailThread::create([
                    'user_id'                => $account->user_id,
                    'user_google_account_id' => $account->id,
                    'gmail_thread_id'        => $threadId,
                    'subject'                => Str::limit($parsed['subject'] ?? '', 500, ''),
                    'snippet'                => $parsed['snippet'] ?? null,
                    'participants_emails'    => $parsed['participants'],
                    'message_count'          => $parsed['message_count'],
                    'first_message_at'       => $parsed['first_message_at'],
                    'last_message_at'        => $parsed['last_message_at'],
                    'discussion_id'          => $discussionId,
                    'synced_at'              => now(),
                ]);

                $result['synced']++;
            } catch (\Throwable $e) {
                Log::warning('GmailSync: thread sync threw', [
                    'account_id' => $account->id,
                    'thread_id'  => $threadId,
                    'err'        => $e->getMessage(),
                ]);
                $result['errors']++;
            }
        }

        $account->forceFill(['last_synced_at' => now()])->save();

        return $result;
    }

    private function fetchThread(string $accessToken, string $threadId): ?array
    {
        $response = Http::withToken($accessToken)
            ->timeout(30)
            ->get(self::GMAIL_LIST_URL . '/' . $threadId, [
                'format' => 'metadata',
                'metadataHeaders' => ['From', 'To', 'Cc', 'Subject', 'Date'],
            ]);

        if (!$response->ok()) {
            return null;
        }
        return $response->json();
    }

    /**
     * @return array{
     *   subject:string|null,
     *   snippet:string|null,
     *   participants:string[],
     *   message_count:int,
     *   first_message_at:Carbon|null,
     *   last_message_at:Carbon|null
     * }
     */
    private function parseThreadMessages(array $thread): array
    {
        $messages = $thread['messages'] ?? [];
        $subject = null;
        $snippet = $thread['snippet'] ?? null;
        $emails = [];
        $internalDates = [];

        foreach ($messages as $msg) {
            if (!$snippet && isset($msg['snippet'])) {
                $snippet = $msg['snippet'];
            }
            $headers = $msg['payload']['headers'] ?? [];
            foreach ($headers as $h) {
                $name = strtolower($h['name'] ?? '');
                $value = $h['value'] ?? '';
                if ($name === 'subject' && !$subject) {
                    $subject = $value;
                } elseif (in_array($name, ['from', 'to', 'cc'], true)) {
                    foreach ($this->extractEmails($value) as $addr) {
                        $emails[$addr] = true;
                    }
                }
            }
            if (isset($msg['internalDate'])) {
                $internalDates[] = (int) $msg['internalDate'];
            }
        }

        sort($internalDates);
        $firstAt = !empty($internalDates) ? Carbon::createFromTimestampMs($internalDates[0]) : null;
        $lastAt  = !empty($internalDates) ? Carbon::createFromTimestampMs(end($internalDates)) : null;

        return [
            'subject'          => $subject,
            'snippet'          => $snippet,
            'participants'     => array_keys($emails),
            'message_count'    => count($messages),
            'first_message_at' => $firstAt,
            'last_message_at'  => $lastAt,
        ];
    }

    /**
     * Pulls the email addresses out of a raw "From: Name <a@b.com>, Other <c@d.com>" header.
     * @return string[]
     */
    private function extractEmails(string $headerValue): array
    {
        if (preg_match_all('/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i', $headerValue, $m)) {
            return array_map('strtolower', $m[0]);
        }
        return [];
    }
}
