<?php

return [
    'scraper' => [
        'url' => env('SCRAPER_SERVICE_URL'),
        'key' => env('SCRAPER_SERVICE_KEY'),
    ],

    'google' => [
        'ios_client_id' => env('GOOGLE_IOS_CLIENT_ID'),
        'web_client_id' => env('GOOGLE_WEB_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
    ],

    'anthropic' => [
        'enabled' => env('ANTHROPIC_ENABLED', false),
    ],

    // iOS push (APNs HTTP/2 + .p8 token-based auth)
    'apn' => [
        'key_id'     => env('APN_KEY_ID'),
        'team_id'    => env('APN_TEAM_ID', '4PP234HMPG'),
        'bundle_id'  => env('APN_BUNDLE_ID', 'app.kontakti'),
        'key_path'   => env('APN_KEY_PATH', storage_path('app/apn-auth-key.p8')),
        'production' => env('APN_PRODUCTION', false),
    ],

    // Web push (VAPID)
    'webpush' => [
        'public_key'  => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        'subject'     => env('VAPID_SUBJECT', 'mailto:jason@kontakti.app'),
    ],

    // FCM (still stubbed — needs service account JSON from Firebase)
    'fcm' => [
        'service_account_path' => env('FCM_SERVICE_ACCOUNT_PATH', storage_path('app/kontakti-firebase.json')),
    ],
];
