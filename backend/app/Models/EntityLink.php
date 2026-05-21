<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class EntityLink extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'entity_links';

    protected $fillable = [
        'source_type', 'source_id',
        'target_type', 'target_id',
        'relationship_type', 'notes',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
