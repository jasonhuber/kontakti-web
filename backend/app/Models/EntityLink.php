<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EntityLink extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'entity_links';

    protected $fillable = [
        'user_id',
        'source_type', 'source_id',
        'target_type', 'target_id',
        'relationship_type', 'notes',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
