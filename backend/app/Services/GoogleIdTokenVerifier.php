<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class GoogleIdTokenVerifier
{
    /**
     * Verify a Google id_token and return its payload.
     *
     * @return array{sub:string,email:string,name?:string,picture?:string,email_verified?:bool,aud?:string,iss?:string}
     */
    public function verify(string $idToken): array
    {
        $allowedAudiences = array_values(array_filter([
            config('services.google.ios_client_id'),
            config('services.google.web_client_id'),
        ]));

        if (empty($allowedAudiences)) {
            throw ValidationException::withMessages([
                'id_token' => ['Google Sign-In is not configured on the API server.'],
            ]);
        }

        $response = Http::acceptJson()
            ->timeout(5)
            ->get('https://oauth2.googleapis.com/tokeninfo', [
                'id_token' => $idToken,
            ]);

        if (!$response->ok()) {
            throw ValidationException::withMessages([
                'id_token' => ['Google identity token could not be verified.'],
            ]);
        }

        $payload = $response->json();

        if (!in_array($payload['aud'] ?? null, $allowedAudiences, true)) {
            throw ValidationException::withMessages([
                'id_token' => ['Google identity token audience is not allowed.'],
            ]);
        }

        if (($payload['iss'] ?? null) !== 'https://accounts.google.com' && ($payload['iss'] ?? null) !== 'accounts.google.com') {
            throw ValidationException::withMessages([
                'id_token' => ['Google identity token issuer is invalid.'],
            ]);
        }

        if (empty($payload['sub']) || empty($payload['email'])) {
            throw ValidationException::withMessages([
                'id_token' => ['Google identity token is missing required profile fields.'],
            ]);
        }

        return $payload;
    }
}
