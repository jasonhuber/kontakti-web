<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserGoogleAccount;
use App\Services\GoogleIdTokenVerifier;
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\{Auth, Hash, Http};
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'username' => 'required|string|max:32|unique:users|alpha_dash',
            'email'    => 'required|email|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user  = User::create([
            'name'     => $data['name'],
            'username' => strtolower($data['username']),
            'email'    => $data['email'],
            'password' => Hash::make($data['password']),
        ]);
        $token = $user->createToken('kontakti-app')->plainTextToken;

        return response()->json(['token' => $token, 'user' => $this->userPayload($user)], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        if (!Auth::attempt($request->only('email', 'password'))) {
            throw ValidationException::withMessages([
                'email' => ['Invalid credentials.'],
            ]);
        }

        $user  = Auth::user();
        $token = $user->createToken('kontakti-app')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user'  => $this->userPayload($user),
        ]);
    }

    public function google(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id_token'         => 'required|string',
            'access_token'     => 'nullable|string',
            'refresh_token'    => 'nullable|string',
            'token_expires_at' => 'nullable|date',
        ]);

        $payload = $this->verifyGoogleIDToken($data['id_token']);
        $email = strtolower($payload['email']);

        $user = User::where('google_id', $payload['sub'])
            ->orWhere('email', $email)
            ->first();

        if ($user) {
            $user->forceFill([
                'google_id' => $payload['sub'],
                'name' => $user->name ?: $payload['name'],
                'avatar_url' => $payload['picture'] ?? $user->avatar_url,
                'email_verified_at' => ($payload['email_verified'] ?? false)
                    ? ($user->email_verified_at ?? now())
                    : $user->email_verified_at,
            ])->save();
        } else {
            $user = User::create([
                'name' => $payload['name'],
                'username' => $this->uniqueUsername($payload['name'], $email),
                'email' => $email,
                'google_id' => $payload['sub'],
                'avatar_url' => $payload['picture'] ?? null,
                'email_verified_at' => ($payload['email_verified'] ?? false) ? now() : null,
                'password' => Hash::make(Str::random(48)),
            ]);
        }

        // Mirror the Google identity into the multi-account table.
        $existingAccount = UserGoogleAccount::where('google_id', $payload['sub'])->first();
        $isFirstGoogleAccount = !$user->googleAccounts()->exists();

        $tokenFields = array_filter([
            'access_token'     => $data['access_token']  ?? null,
            'refresh_token'    => $data['refresh_token'] ?? null,
            'token_expires_at' => $data['token_expires_at'] ?? null,
        ], fn ($v) => $v !== null);

        if ($existingAccount) {
            $existingAccount->forceFill(array_merge([
                'user_id'    => $user->id,
                'email'      => $email,
                'avatar_url' => $payload['picture'] ?? $existingAccount->avatar_url,
            ], $tokenFields))->save();
        } else {
            UserGoogleAccount::create(array_merge([
                'user_id'    => $user->id,
                'google_id'  => $payload['sub'],
                'email'      => $email,
                'avatar_url' => $payload['picture'] ?? null,
                'is_primary' => $isFirstGoogleAccount,
                'label'      => 'personal',
            ], $tokenFields));
        }

        $token = $user->createToken('kontakti-ios')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->userPayload($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->userPayload($request->user()));
    }

    public function completeOnboarding(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->markOnboarded();

        return response()->json($this->userPayload($user->fresh() ?? $user));
    }

    private function userPayload(User $user): array
    {
        return array_replace($user->toArray(), [
            'id' => (string) $user->id,
        ]);
    }

    private function verifyGoogleIDToken(string $idToken): array
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

    private function uniqueUsername(string $name, string $email): string
    {
        $base = Str::of($name)->ascii()->lower()->replaceMatches('/[^a-z0-9]+/', '-')->trim('-')->limit(24, '');
        if ($base->isEmpty()) {
            $base = Str::of(Str::before($email, '@'))->ascii()->lower()->replaceMatches('/[^a-z0-9]+/', '-')->trim('-')->limit(24, '');
        }
        if ($base->isEmpty()) {
            $base = Str::of('user');
        }

        $candidate = (string) $base;
        $suffix = 2;

        while (User::where('username', $candidate)->exists()) {
            $candidate = Str::limit((string) $base, 27, '') . '-' . $suffix;
            $suffix++;
        }

        return $candidate;
    }
}
