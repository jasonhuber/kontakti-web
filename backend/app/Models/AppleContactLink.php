<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppleContactLink extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'person_id', 'cn_contact_identifier', 'device_label'];

    protected $casts = ['updated_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
