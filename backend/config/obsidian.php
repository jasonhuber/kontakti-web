<?php

return [
    'vault_path'   => env('OBSIDIAN_VAULT_PATH', $_SERVER['HOME'] . '/Documents/Obsidian/Personal'),
    'crm_folder'   => env('OBSIDIAN_CRM_FOLDER', 'kontakti'),
    'sync_enabled' => env('OBSIDIAN_SYNC_ENABLED', true),
    'auto_sync'    => env('OBSIDIAN_AUTO_SYNC', false),
    'subfolders'   => [
        'people'      => 'people',
        'companies'   => 'companies',
        'discussions' => 'discussions',
        'deals'       => 'deals',
        'notes'       => 'notes',
    ],
];
