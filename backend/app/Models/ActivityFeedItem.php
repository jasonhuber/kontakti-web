<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class ActivityFeedItem extends Model
{
    use HasUuids;

    protected $table = 'activity_feed';

    public $timestamps = false;

    protected $fillable = [
        'subject_type', 'subject_id', 'verb',
        'object_type', 'object_id', 'payload',
    ];

    protected $casts = [
        'payload'    => 'array',
        'created_at' => 'datetime',
    ];

    public static function log(
        string $subjectType,
        string $subjectId,
        string $verb,
        ?string $objectType = null,
        ?string $objectId = null,
        array $payload = []
    ): static {
        return static::create([
            'subject_type' => $subjectType,
            'subject_id'   => $subjectId,
            'verb'         => $verb,
            'object_type'  => $objectType,
            'object_id'    => $objectId,
            'payload'      => $payload,
            'created_at'   => now(),
        ]);
    }
}
