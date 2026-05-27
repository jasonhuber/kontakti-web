<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\UserGoogleAccount;
use App\Services\GmailSyncService;
use Illuminate\Http\{JsonResponse, Request};

class GmailController extends Controller
{
    public function __construct(private GmailSyncService $sync)
    {
    }

    /**
     * POST /api/v1/gmail/{user_google_account}/sync
     */
    public function sync(Request $request, UserGoogleAccount $user_google_account): JsonResponse
    {
        abort_if($user_google_account->user_id !== $request->user()->id, 403);

        $limit = (int) $request->query('limit', 50);
        $limit = max(1, min(200, $limit));

        $result = $this->sync->syncForAccount($user_google_account, $limit);

        return response()->json(array_merge([
            'user_google_account_id' => $user_google_account->id,
        ], $result));
    }

    /**
     * POST /api/v1/gmail/sync-all
     */
    public function syncAll(Request $request): JsonResponse
    {
        $user = $request->user();
        $limit = (int) $request->query('limit', 50);
        $limit = max(1, min(200, $limit));

        $totals = ['synced' => 0, 'discussions_created' => 0, 'errors' => 0];
        $perAccount = [];

        foreach ($user->googleAccounts()->whereNotNull('refresh_token')->get() as $account) {
            $r = $this->sync->syncForAccount($account, $limit);
            $perAccount[] = array_merge([
                'user_google_account_id' => $account->id,
                'email'                  => $account->email,
            ], $r);
            $totals['synced']              += $r['synced'];
            $totals['discussions_created'] += $r['discussions_created'];
            $totals['errors']              += $r['errors'];
        }

        return response()->json([
            'totals'   => $totals,
            'accounts' => $perAccount,
        ]);
    }
}
