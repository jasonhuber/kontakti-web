<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};

class AccountPlan extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'company_id',
        'title',
        'status',
        'objective',
        'summary',
        'known_context',
        'risks',
        'open_questions',
        'messaging_angles',
        'metadata',
    ];

    protected $casts = [
        'known_context' => 'array',
        'risks' => 'array',
        'open_questions' => 'array',
        'messaging_angles' => 'array',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(AccountPlanItem::class)
            ->orderByRaw('due_at is null')
            ->orderBy('due_at')
            ->orderBy('id');
    }
}
