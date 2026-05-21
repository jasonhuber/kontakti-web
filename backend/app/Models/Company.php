<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{HasMany, BelongsToMany};
use Illuminate\Database\Eloquent\Builder;

class Company extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'name', 'domain', 'logo_url', 'industry',
        'size_range', 'linkedin_url', 'website', 'notes', 'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function people(): HasMany
    {
        return $this->hasMany(Person::class);
    }

    public function deals(): HasMany
    {
        return $this->hasMany(Deal::class);
    }

    public function discussions(): HasMany
    {
        return $this->hasMany(Discussion::class);
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'taggables', 'taggable_id', 'tag_id')
            ->wherePivot('taggable_type', self::class);
    }

    public function getObsidianLinkAttribute(): string
    {
        return "[[{$this->name}]]";
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        return $query->whereRaw(
            "search_vector @@ plainto_tsquery('english', ?)",
            [$term]
        )->orderByRaw(
            "ts_rank(search_vector, plainto_tsquery('english', ?)) DESC",
            [$term]
        );
    }
}
