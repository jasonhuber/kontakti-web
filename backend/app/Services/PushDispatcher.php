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
            $options = [
                'key_id'                => $keyId,
                'team_id'               => $teamId,
                'app_bundle_id'         => $bundleId,
                'private_key_path'      => $keyPath,
                'private_key_secret'    => null,
            ];
            $authProvider = ApnAuthToken::create($options);
            $client       = new ApnClient($authProvider, $isProd);

            $sent = 0;
            foreach ($tokens as $row) {
                $payload = ApnPayload::create()
                    ->setAlertTitle($title)
                    ->setAlertBody($body)
                    ->setSound('default');
                foreach ($data as $k => $v) {
                    $payload->setCustomValue((string) $k, $v);
                }
                $notification = new ApnNotification($payload, $row->token);
                $client->addNotification($notification);
            }

            $responses = $client->push();
            foreach ($responses as $i => $response) {
                $row = $tokens[$i] ?? null;
                $status = $response->getStatusCode();
                if ($status >= 200 && $status < 300) {
                    $sent++;
                    $row?->forceFill(['last_seen_at' => now()])->save();
                } elseif (in_array($status, [400, 410], true)) {
                    // 410 Unregistered, 400 BadDeviceToken → disable
                    $row?->forceFill(['enabled' => false])->save();
                    Log::info('APN token disabled', ['user_id' => $row?->user_id, 'status' => $status]);
                } else {
                    Log::warning('APN unexpected status', [
                        'user_id' => $row?->user_id,
                        'status'  => $status,
                        'reason'  => $response->getReasonPhrase(),
                    ]);
                }
            }

            return $sent;
        } catch (\Throwable $e) {
            Log::error('APN dispatch failed', ['err' => $e->getMessage()]);
            return 0;
        }
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
