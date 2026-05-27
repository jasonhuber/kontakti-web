<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\PushToken;
use Illuminate\Http\{JsonResponse, Request};

/**
 * Push token registry. Clients (iOS / web push / Android) POST their device
 * token here on login + each time the OS hands them a fresh one.
 *
 * IMPORTANT for whoever wires the actual dispatch: this controller only
 * stores tokens. The send-side is in {@see \App\Services\PushDispatcher},
 * which today logs at info level instead of calling APNs / FCM / Web Push.
 * To go live, install one of:
 *   - laravel-notification-channels/apn
 *   - laravel-notification-channels/fcm
 *   - minishlink/web-push
 * provide the credentials in config/services.php, and replace the dispatch
 * stub in PushDispatcher::send().
 */
class PushTokensController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform'  => 'required|in:ios,web,android',
            'token'     => 'required|string',
            'device_id' => 'nullable|string|max:120',
        ]);

        $user = $request->user();

        // Upsert by (user_id, platform, token).
        $row = PushToken::where('user_id', $user->id)
            ->where('platform', $data['platform'])
            ->where('token', $data['token'])
            ->first();

        if ($row) {
            $row->forceFill([
                'device_id'    => $data['device_id'] ?? $row->device_id,
                'enabled'      => true,
                'last_seen_at' => now(),
            ])->save();
        } else {
            $row = PushToken::create([
                'user_id'      => $user->id,
                'platform'     => $data['platform'],
                'token'        => $data['token'],
                'device_id'    => $data['device_id'] ?? null,
                'enabled'      => true,
                'last_seen_at' => now(),
            ]);
        }

        return response()->json($row, 201);
    }

    public function unregister(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => 'required|string',
        ]);

        $count = PushToken::where('user_id', $request->user()->id)
            ->where('token', $data['token'])
            ->update(['enabled' => false]);

        return response()->json(['disabled' => $count]);
    }
}
