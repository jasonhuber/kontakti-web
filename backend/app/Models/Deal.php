<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany, BelongsToMany, MorphMany};
use Illuminate\Database\Eloquent\Builder;

class Deal extends Model
{
    use HasUuids, SoftDeletes;

    const STAGES = [
        'discovery',
        'qualified',
        'proposal',
        'negotiation',
        'closed_won',
        'closed_lost',
        'on_hold',
    ];

    protected $fillable = [
        'title', 'description', 'stage', 'value', 'currency',
        'company_id', 'expected_close_date', 'closed_at',
        'pipeline_position', 'metadata',
    ];

    protected $casts = [
        'value'               => 'decimal:2',
        'expected_close_date' => 'date',
        'closed_at'           => 'datetime',
        'metadata'            => 'array',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function contacts(): BelongsToMany
    {
        return $this->belongsToMany(Person::class, 'deal_contacts')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function discussions(): HasMany
    {
        return $this->hasMany(Discussion::class);
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

    public function getObsidianLinkAttribute(): string
    {
        return "[[{$this->title}]]";
    }

    public function isActive(): bool
    {
        return !in_array($this->stage, ['closed_won', 'closed_lost']);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNotIn('stage', ['closed_won', 'closed_lost']);
    }

    public function scopeByStage(Builder $query, string $stage): Builder
    {
        return $query->where('stage', $stage)->orderBy('pipeline_position');
    }
}
