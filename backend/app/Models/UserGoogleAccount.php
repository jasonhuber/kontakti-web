<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserGoogleAccount extends Model
{
    protected $fillable = [
        'user_id',
        'google_id',
        'email',
        'label',
        'is_primary',
        'avatar_url',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'last_synced_at',
    ];

    protected $hidden = [
        'access_token',
        'refresh_token',
    ];

    protected function casts(): array
    {
        return [
            'is_primary'       => 'boolean',
            'token_expires_at' => 'datetime',
            'last_synced_at'   => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
