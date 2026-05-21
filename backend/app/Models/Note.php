<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{MorphTo, BelongsToMany};
use Illuminate\Database\Eloquent\Builder;

class Note extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'title', 'body', 'notable_type', 'notable_id',
        'obsidian_path', 'synced_at', 'metadata',
    ];

    protected $casts = [
        'synced_at' => 'datetime',
        'metadata'  => 'array',
    ];

    public function notable(): MorphTo
    {
        return $this->morphTo();
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'taggables', 'taggable_id', 'tag_id')
            ->wherePivot('taggable_type', self::class);
    }

    public function isSynced(): bool
    {
        return $this->synced_at !== null && $this->synced_at->gte($this->updated_at);
    }

    public function getSyncStatusAttribute(): string
    {
        if ($this->synced_at === null) return 'never';
        return $this->isSynced() ? 'synced' : 'stale';
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        return $query->whereRaw(
            "MATCH(title, body) AGAINST (? IN BOOLEAN MODE)",
            [$term . '*']
        );
    }

    public function scopeUnsynced(Builder $query): Builder
    {
        return $query->where(function ($q) {
            $q->whereNull('synced_at')
              ->orWhereColumn('synced_at', '<', 'updated_at');
        });
    }
}
