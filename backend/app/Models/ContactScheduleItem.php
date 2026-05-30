<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContactScheduleItem extends Model
{
    protected $table = 'contact_schedule';

    protected $fillable = [
        'user_id', 'person_id', 'due_at', 'reason', 'label', 'status', 'snoozed_until',
    ];

    protected $casts = [
        'due_at'        => 'date',
        'snoozed_until' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    /** Pending items that are actually actionable now (not snoozed into the future). */
    public function scopeDue($query, ?\Carbon\Carbon $through = null)
    {
        $through ??= now();
        return $query->where('status', 'pending')
            ->where('due_at', '<=', $through->toDateString())
            ->where(fn($q) => $q->whereNull('snoozed_until')->orWhere('snoozed_until', '<=', now()->toDateString()));
    }
}
