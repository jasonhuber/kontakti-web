<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, BelongsToMany, MorphMany};
use Illuminate\Database\Eloquent\Builder;

class Discussion extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'title', 'date', 'type', 'summary', 'body', 'deal_id', 'metadata',
    ];

    protected $casts = [
        'date'     => 'datetime',
        'metadata' => 'array',
    ];

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(Person::class, 'discussion_people')
            ->withTimestamps();
    }

    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'notable');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'taggables', 'taggable_id', 'tag_id')
            ->wherePivot('taggable_type', self::class);
    }

    public function getObsidianTitleAttribute(): string
    {
        return $this->date->format('Y-m-d') . ' ' . $this->title;
    }

    public function getObsidianLinkAttribute(): string
    {
        return "[[{$this->obsidian_title}]]";
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
