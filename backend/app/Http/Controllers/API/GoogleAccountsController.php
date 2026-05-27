<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\UserGoogleAccount;
use App\Services\GoogleIdTokenVerifier;
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class GoogleAccountsController extends Controller
{
    private const VALID_LABELS = ['personal', 'work', 'other'];

    public function __construct(private GoogleIdTokenVerifier $verifier)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $accounts = $request->user()
            ->googleAccounts()
            ->orderByDesc('is_primary')
            ->orderBy('created_at')
            ->get();

        return response()->json($accounts);
    }

    public function link(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id_token'         => 'required|string',
            'label'            => 'nullable|string|in:personal,work,other',
            'access_token'     => 'nullable|string',
            'refresh_token'    => 'nullable|string',
            'token_expires_at' => 'nullable|date',
        ]);

        $tokenFields = array_filter([
            'access_token'     => $data['access_token']  ?? null,
            'refresh_token'    => $data['refresh_token'] ?? null,
            'token_expires_at' => $data['token_expires_at'] ?? null,
        ], fn ($v) => $v !== null);

        $user    = $request->user();
        $payload = $this->verifier->verify($data['id_token']);
        $email   = strtolower($payload['email']);
        $label   = $data['label'] ?? 'personal';

        $existing = UserGoogleAccount::where('google_id', $payload['sub'])->first();

        if ($existing && $existing->user_id !== $user->id) {
            throw ValidationException::withMessages([
                'id_token' => ['This Google account is already linked to a different Kontakti user.'],
            ]);
        }

        if ($existing) {
            $existing->forceFill(array_merge([
                'email'      => $email,
                'avatar_url' => $payload['picture'] ?? $existing->avatar_url,
                'label'      => $label,
            ], $tokenFields))->save();

            return response()->json($existing->fresh());
        }

        $isFirst = !$user->googleAccounts()->exists();

        $account = UserGoogleAccount::create(array_merge([
            'user_id'    => $user->id,
            'google_id'  => $payload['sub'],
            'email'      => $email,
            'avatar_url' => $payload['picture'] ?? null,
            'label'      => $label,
            'is_primary' => $isFirst,
        ], $tokenFields));

        return response()->json($account, 201);
    }

    public function update(Request $request, UserGoogleAccount $user_google_account): JsonResponse
    {
        $this->authorizeAccount($request, $user_google_account);

        $data = $request->validate([
            'label'      => 'sometimes|string|in:personal,work,other',
            'is_primary' => 'sometimes|boolean',
        ]);

        DB::transaction(function () use ($request, $user_google_account, $data) {
            if (array_key_exists('label', $data)) {
                $user_google_account->label = $data['label'];
            }

            if (array_key_exists('is_primary', $data) && $data['is_primary']) {
                // Atomically unset on other accounts owned by this user.
                $request->user()
                    ->googleAccounts()
                    ->where('id', '!=', $user_google_account->id)
                    ->update(['is_primary' => false]);

                $user_google_account->is_primary = true;
            } elseif (array_key_exists('is_primary', $data) && !$data['is_primary']) {
                // Refuse to unset primary directly — must promote another instead.
                throw ValidationException::withMessages([
                    'is_primary' => ['Cannot unset primary directly. Promote another account instead.'],
                ]);
            }

            $user_google_account->save();
        });

        return response()->json($user_google_account->fresh());
    }

    public function destroy(Request $request, UserGoogleAccount $user_google_account): JsonResponse
    {
        $this->authorizeAccount($request, $user_google_account);

        $user = $request->user();
        $totalAccounts = $user->googleAccounts()->count();
        $hasPassword = !empty($user->getAuthPassword());

        if ($totalAccounts <= 1 && !$hasPassword) {
            throw ValidationException::withMessages([
                'account' => ['Cannot unlink your only Google account without a password set.'],
            ]);
        }

        if ($user_google_account->is_primary && $totalAccounts > 1) {
            throw ValidationException::withMessages([
                'account' => ['Cannot unlink the primary account. Promote another account first.'],
            ]);
        }

        $user_google_account->delete();

        return response()->json(['deleted' => true]);
    }

    private function authorizeAccount(Request $request, UserGoogleAccount $account): void
    {
        if ($account->user_id !== $request->user()->id) {
            abort(404);
        }
    }
}
