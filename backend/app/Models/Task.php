<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Builder;

class Task extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'user_id',
        'title', 'description', 'due_at', 'completed_at',
        'taskable_type', 'taskable_id', 'priority',
    ];

    protected $casts = [
        'due_at'       => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function taskable(): MorphTo
    {
        return $this->morphTo();
    }

    public function complete(): void
    {
        $this->update(['completed_at' => now()]);
    }

    public function reopen(): void
    {
        $this->update(['completed_at' => null]);
    }

    public function isComplete(): bool
    {
        return $this->completed_at !== null;
    }

    public function isOverdue(): bool
    {
        return !$this->isComplete() && $this->due_at?->isPast();
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->whereNull('completed_at');
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->whereNull('completed_at')
            ->whereNotNull('due_at')
            ->where('due_at', '<', now());
    }
}
