<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmailThread extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'user_google_account_id',
        'gmail_thread_id',
        'subject',
        'snippet',
        'participants_emails',
        'message_count',
        'first_message_at',
        'last_message_at',
        'discussion_id',
        'synced_at',
    ];

    protected $casts = [
        'participants_emails' => 'array',
        'first_message_at'    => 'datetime',
        'last_message_at'     => 'datetime',
        'synced_at'           => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function googleAccount(): BelongsTo
    {
        return $this->belongsTo(UserGoogleAccount::class, 'user_google_account_id');
    }

    public function discussion(): BelongsTo
    {
        return $this->belongsTo(Discussion::class);
    }
}
