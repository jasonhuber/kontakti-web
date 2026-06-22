<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GoogleContactLink extends Model
{
    public $timestamps = false; // only updated_at, maintained by the DB.

    protected $fillable = [
        'user_id',
        'person_id',
        'resource_name',
        'etag',
        'google_account_id',
        'account_email',
        'last_pushed_at',
    ];

    protected function casts(): array
    {
        return [
            'last_pushed_at' => 'datetime',
            'updated_at'     => 'datetime',
        ];
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function googleAccount(): BelongsTo
    {
        return $this->belongsTo(UserGoogleAccount::class, 'google_account_id');
    }
}
