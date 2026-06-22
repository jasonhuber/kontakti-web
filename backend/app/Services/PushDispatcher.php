<?php

namespace App\Services;

use App\Models\User;
use App\Models\PushToken;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;
use NotificationChannels\Apn\ApnChannel;
use NotificationChannels\Apn\ApnMessage;
use Pushok\AuthProvider\Token as ApnAuthToken;
use Pushok\Client as ApnClient;
use Pushok\Notification as ApnNotification;
use Pushok\Payload as ApnPayload;
use Pushok\Payload\Alert as ApnPayloadAlert;

/**
 * Dispatches push notifications across iOS (APN), web (web-push), and Android (FCM).
 *
 * APN + web-push are wired live. Android FCM is still stubbed (waiting on
 * Firebase service-account JSON — Google org policy is blocking key download).
 *
 * Behaviour:
 *  - Tokens that return 410/Unregistered are auto-disabled (enabled=false).
 *  - Each platform path is wrapped in try/catch so one failure doesn't stop the rest.
 *  - On missing credentials, that platform silently no-ops (info-logged once).
 */
class PushDispatcher
{
    public function send(User $user, string $title, string $body, array $data = []): int
    {
        $tokens = $user->pushTokens()->where('enabled', true)->get();
        if ($tokens->isEmpty()) {
            return 0;
        }

        $sent = 0;

        // Group tokens by platform.
        $byPlatform = $tokens->groupBy('platform');

        if ($byPlatform->has('ios')) {
            $sent += $this->sendApn($byPlatform->get('ios'), $title, $body, $data);
        }
        if ($byPlatform->has('web')) {
            $sent += $this->sendWebPush($byPlatform->get('web'), $title, $body, $data);
        }
        if ($byPlatform->has('android')) {
            $sent += $this->sendFcm($byPlatform->get('android'), $title, $body, $data);
        }

        return $sent;
    }

    // ─── iOS (APN) ────────────────────────────────────────────────────────────
    private function sendApn(iterable $tokens, string $title, string $body, array $data): int
    {
        $keyId    = config('services.apn.key_id');
        $teamId   = config('services.apn.team_id');
        $bundleId = config('services.apn.bundle_id');
        $keyPath  = config('services.apn.key_path');
        $isProd   = (bool) config('services.apn.production', false);

        if (!$keyId || !$teamId || !$bundleId || !$keyPath || !is_readable($keyPath)) {
            Log::info('PushDispatcher: APN credentials missing, skipping iOS', [
                'have_key_id'   => (bool) $keyId,
                'have_team_id'  => (bool) $teamId,
                'have_bundle'   => (bool) $bundleId,
                'key_readable'  => $keyPath ? is_readable($keyPath) : false,
            ]);
            return 0;
        }

        try {
            $authProvider = ApnAuthToken::create([
                'key_id'             => $keyId,
                'team_id'            => $teamId,
                'app_bundle_id'      => $bundleId,
                'private_key_path'   => $keyPath,
                'private_key_secret' => null,
            ]);

            $rows = array_values(is_array($tokens) ? $tokens : iterator_to_array($tokens));
            $sent = 0;

            // Try the configured gateway first. Any token that fails with an
            // environment-mismatch status (a sandbox token hitting production, or
            // vice-versa) is retried on the OTHER gateway before we give up — so a
            // debug/Xcode build and a TestFlight/App Store build both deliver,
            // regardless of how APN_PRODUCTION happens to be set.
            $retry = $this->pushApnBatch($authProvider, $isProd, $rows, $title, $body, $data, false, $sent);
            if (!empty($retry)) {
                $this->pushApnBatch($authProvider, !$isProd, $retry, $title, $body, $data, true, $sent);
            }

            return $sent;
        } catch (\Throwable $e) {
            Log::error('APN dispatch failed', ['err' => $e->getMessage()]);
            return 0;
        }
    }

    /**
     * Push one batch of token rows on a single APNs environment.
     *
     * @param  bool  $isFinal  When false, tokens failing with a possible
     *                         wrong-environment status (400/403) are returned for
     *                         a retry on the other gateway instead of being
     *                         disabled. When true, those failures are final.
     * @return array  Rows to retry on the other gateway (empty when $isFinal).
     */
    private function pushApnBatch(
        $authProvider,
        bool $isProd,
        array $rows,
        string $title,
        string $body,
        array $data,
        bool $isFinal,
        int &$sent
    ): array {
        if (empty($rows)) {
            return [];
        }

        $client  = new ApnClient($authProvider, $isProd);
        $byToken = [];
        foreach ($rows as $row) {
            $byToken[$row->token] = $row;
            $alert = ApnPayloadAlert::create()
                ->setTitle($title)
                ->setBody($body);
            $payload = ApnPayload::create()
                ->setAlert($alert)
                ->setSound('default');
            foreach ($data as $k => $v) {
                $payload->setCustomValue((string) $k, $v);
            }
            $client->addNotification(new ApnNotification($payload, $row->token));
        }

        $retry = [];
        foreach ($client->push() as $response) {
            $row    = $byToken[$response->getDeviceToken()] ?? null;
            $status = $response->getStatusCode();

            if ($status >= 200 && $status < 300) {
                $sent++;
                $row?->forceFill(['last_seen_at' => now()])->save();
            } elseif (!$isFinal && in_array($status, [400, 403], true)) {
                // Possibly the wrong environment for this token — retry elsewhere.
                if ($row) {
                    $retry[] = $row;
                }
            } elseif (in_array($status, [400, 410], true)) {
                // Genuinely dead on both gateways: 410 Unregistered / 400 BadDeviceToken.
                $row?->forceFill(['enabled' => false])->save();
                Log::info('APN token disabled', ['user_id' => $row?->user_id, 'status' => $status]);
            } else {
                Log::warning('APN status not delivered', [
                    'user_id' => $row?->user_id,
                    'status'  => $status,
                    'reason'  => $response->getReasonPhrase(),
                ]);
            }
        }

        return $retry;
    }

    // ─── Web (VAPID + web-push) ──────────────────────────────────────────────
    private function sendWebPush(iterable $tokens, string $title, string $body, array $data): int
    {
        $publicKey  = config('services.webpush.public_key');
        $privateKey = config('services.webpush.private_key');
        $subject    = config('services.webpush.subject');

        if (!$publicKey || !$privateKey || !$subject) {
            Log::info('PushDispatcher: VAPID credentials missing, skipping web');
            return 0;
        }

        try {
            $webPush = new WebPush([
                'VAPID' => [
                    'subject'    => $subject,
                    'publicKey'  => $publicKey,
                    'privateKey' => $privateKey,
                ],
            ]);

            $payload = json_encode([
                'title' => $title,
                'body'  => $body,
                'data'  => $data,
            ]);

            // Map token rows to subscriptions.
            $rowsByEndpoint = [];
            foreach ($tokens as $row) {
                $sub = json_decode($row->token, true);
                if (!is_array($sub) || empty($sub['endpoint'])) {
                    continue;
                }
                $rowsByEndpoint[$sub['endpoint']] = $row;
                $webPush->queueNotification(
                    Subscription::create($sub),
                    $payload,
                );
            }

            $sent = 0;
            foreach ($webPush->flush() as $report) {
                $endpoint = $report->getRequest()->getUri()->__toString();
                $row = $rowsByEndpoint[$endpoint] ?? null;
                if ($report->isSuccess()) {
                    $sent++;
                    $row?->forceFill(['last_seen_at' => now()])->save();
                } elseif ($report->isSubscriptionExpired()) {
                    $row?->forceFill(['enabled' => false])->save();
                    Log::info('Web push subscription expired', ['user_id' => $row?->user_id]);
                } else {
                    Log::warning('Web push failure', [
                        'user_id' => $row?->user_id,
                        'reason'  => $report->getReason(),
                    ]);
                }
            }
            return $sent;
        } catch (\Throwable $e) {
            Log::error('Web push dispatch failed', ['err' => $e->getMessage()]);
            return 0;
        }
    }

    // ─── Android (FCM) — still stubbed ────────────────────────────────────────
    private function sendFcm(iterable $tokens, string $title, string $body, array $data): int
    {
        Log::info('PushDispatcher: FCM not yet wired (waiting on Firebase service account JSON)', [
            'token_count' => is_countable($tokens) ? count($tokens) : null,
        ]);
        return 0;
    }
}
