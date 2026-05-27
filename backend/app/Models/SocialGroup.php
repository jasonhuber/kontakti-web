<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, BelongsToMany};

class SocialGroup extends Model
{
    use HasUuids;

    protected $table = 'social_groups';

    protected $fillable = [
        'user_id', 'source', 'external_id', 'name',
        'member_count', 'last_synced_at', 'metadata',
    ];

    protected $casts = [
        'metadata'       => 'array',
        'last_synced_at' => 'datetime',
        'member_count'   => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(Person::class, 'social_group_members')
            ->withPivot(['role', 'joined_at']);
    }
}
