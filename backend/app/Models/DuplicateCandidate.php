<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

class DuplicateCandidate extends Model
{
    protected $fillable = [
        'user_id',
        'group_key',
        'person_ids',
        'status',
        'ai_decision',
        'ai_confidence',
        'reviewed_at',
    ];

    protected $casts = [
        'person_ids'    => 'array',
        'ai_decision'   => 'array',
        'ai_confidence' => 'float',
        'reviewed_at'   => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Fetch the actual Person rows referenced by this candidate, scoped to the
     * owning user for safety.
     */
    public function people(): Collection
    {
        $ids = $this->person_ids ?? [];
        if (empty($ids)) {
            return collect();
        }

        return Person::whereIn('id', $ids)
            ->where('user_id', $this->user_id)
            ->with('company')
            ->get();
    }
}
