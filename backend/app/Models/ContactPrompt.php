<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContactPrompt extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id', 'person_id', 'question_key', 'question_text',
        'shown_at', 'answered_at', 'skipped_at', 'answer', 'answer_structured',
    ];

    protected $casts = [
        'shown_at'          => 'datetime',
        'answered_at'       => 'datetime',
        'skipped_at'        => 'datetime',
        'answer_structured' => 'array',
    ];

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
