<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany, BelongsToMany, MorphMany};
use Illuminate\Database\Eloquent\Builder;

class Person extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'first_name', 'last_name', 'email', 'phone',
        'linkedin_url', 'avatar_url', 'company_id', 'title',
        'relationship_strength', 'last_contacted_at', 'next_followup_at',
        'notes', 'metadata',
    ];

    protected $casts = [
        'metadata'          => 'array',
        'last_contacted_at' => 'datetime',
        'next_followup_at'  => 'datetime',
    ];

    // — Relationships —

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function discussions(): BelongsToMany
    {
        return $this->belongsToMany(Discussion::class, 'discussion_people')
            ->withTimestamps()
            ->latest('discussions.date');
    }

    public function deals(): BelongsToMany
    {
        return $this->belongsToMany(Deal::class, 'deal_contacts')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'notable');
    }

    public function tasks(): MorphMany
    {
        return $this->morphMany(Task::class, 'taskable');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'taggables', 'taggable_id', 'tag_id')
            ->wherePivot('taggable_type', self::class);
    }

    // — Computed attributes —

    public function getFullNameAttribute(): string
    {
        return "{$this->first_name} {$this->last_name}";
    }

    public function getObsidianLinkAttribute(): string
    {
        return "[[{$this->full_name}]]";
    }

    // — Scopes —

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->whereNotNull('next_followup_at')
            ->where('next_followup_at', '<', now());
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        return $query->whereRaw(
            "MATCH(first_name, last_name, email, title, notes) AGAINST (? IN BOOLEAN MODE)",
            [$term . '*']
        );
    }

    // — Activity logging —

    protected static function booted(): void
    {
        static::saved(function (Person $person) {
            ActivityFeedItem::log('person', $person->id, $person->wasRecentlyCreated ? 'created' : 'updated');
        });
    }
}
