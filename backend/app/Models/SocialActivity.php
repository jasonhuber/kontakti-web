<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SocialActivity extends Model
{
    use HasUuids;

    protected $table = 'social_activity';

    // The schema manages created_at as `cached_at`; no updated_at column.
    public $timestamps = false;

    protected $fillable = [
        'person_id', 'user_id', 'source', 'kind', 'occurred_at',
        'content', 'location', 'image_url', 'external_url',
        'engagement', 'metadata', 'cached_at', 'acknowledged_at',
    ];

    protected $casts = [
        'occurred_at'     => 'datetime',
        'cached_at'       => 'datetime',
        'acknowledged_at' => 'datetime',
        'engagement'      => 'array',
        'metadata'        => 'array',
    ];

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
