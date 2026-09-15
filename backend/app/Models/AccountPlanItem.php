<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountPlanItem extends Model
{
    protected $fillable = [
        'account_plan_id',
        'type',
        'title',
        'description',
        'status',
        'priority',
        'due_at',
        'person_id',
        'task_id',
        'source_type',
        'source_id',
        'operation_key',
        'ai_generated',
        'ai_confidence',
        'metadata',
    ];

    protected $casts = [
        'due_at' => 'date',
        'ai_generated' => 'boolean',
        'metadata' => 'array',
    ];

    public function accountPlan(): BelongsTo
    {
        return $this->belongsTo(AccountPlan::class);
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }
}
