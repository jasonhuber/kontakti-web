<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReachOutLog extends Model
{
    use HasUuids;

    protected $table = 'reach_out_log';

    public $timestamps = false;

    protected $fillable = [
        'user_id', 'person_id', 'via', 'reason', 'note', 'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (ReachOutLog $log) {
            if (!$log->created_at) {
                $log->created_at = now();
            }
        });
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
