<?php

namespace App\Services;

use App\Models\UserGoogleAccount;
use Illuminate\Support\Facades\{Http, Log};
use RuntimeException;

/**
 * Mints and refreshes Gmail-scoped OAuth access tokens for a UserGoogleAccount.
 *
 * The client (iOS / web) is responsible for completing the OAuth code exchange
 * with Gmail-read scope and POSTing the resulting access_token + refresh_token
 * + token_expires_at to the backend (see AuthController::google and
 * GoogleAccountsController::link). This service keeps the access token fresh
 * thereafter using the stored refresh token.
 */
class GoogleTokenManager
{
    /**
     * Refresh tokens that expire within this many seconds.
     */
    public const REFRESH_THRESHOLD_SECONDS = 300;

    /**
     * Return a valid access token, refreshing if it's near expiry.
     *
     * @throws RuntimeException when the account has no refresh token or refresh fails.
     */
    public function freshAccessToken(UserGoogleAccount $account): string
    {
        $needsRefresh = !$account->access_token
            || !$account->token_expires_at
            || $account->token_expires_at->lt(now()->addSeconds(self::REFRESH_THRESHOLD_SECONDS));

        if (!$needsRefresh) {
            return $account->access_token;
        }

        if (!$account->refresh_token) {
            throw new RuntimeException(
                "UserGoogleAccount {$account->id} has no refresh token; cannot refresh."
            );
        }

        $clientId = config('services.google.web_client_id');
        $clientSecret = config('services.google.client_secret');

        if (!$clientId || !$clientSecret) {
            throw new RuntimeException(
                'Google OAuth credentials not configured (services.google.web_client_id / .client_secret).'
            );
        }

        try {
            $response = Http::asForm()
                ->timeout(10)
                ->post('https://oauth2.googleapis.com/token', [
                    'client_id'     => $clientId,
                    'client_secret' => $clientSecret,
                    'refresh_token' => $account->refresh_token,
                    'grant_type'    => 'refresh_token',
                ]);
        } catch (\Throwable $e) {
            Log::warning('GoogleTokenManager refresh threw', [
                'account_id' => $account->id,
                'err'        => $e->getMessage(),
            ]);
            throw new RuntimeException('Google token refresh transport failed: ' . $e->getMessage(), 0, $e);
        }

        if (!$response->ok()) {
            Log::warning('GoogleTokenManager refresh non-2xx', [
                'account_id' => $account->id,
                'status'     => $response->status(),
                'body'       => $response->body(),
            ]);
            throw new RuntimeException("Google token refresh failed: HTTP {$response->status()}");
        }

        $body = $response->json();
        $accessToken = $body['access_token'] ?? null;
        $expiresIn = (int) ($body['expires_in'] ?? 3600);

        if (!$accessToken) {
            throw new RuntimeException('Google token refresh response missing access_token.');
        }

        $account->forceFill([
            'access_token'     => $accessToken,
            'token_expires_at' => now()->addSeconds($expiresIn),
        ])->save();

        return $accessToken;
    }
}
