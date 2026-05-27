<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'username',
        'email',
        'google_id',
        'avatar_url',
        'onboarded_at',
        'last_nightly_sync_at',
        'email_verified_at',
        'password',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at'    => 'datetime',
            'onboarded_at'         => 'datetime',
            'last_nightly_sync_at' => 'datetime',
            'password'             => 'hashed',
        ];
    }

    public function markOnboarded(): void
    {
        if ($this->onboarded_at === null) {
            $this->forceFill(['onboarded_at' => now()])->save();
        }
    }

    public function people()
    {
        return $this->hasMany(Person::class);
    }

    public function companies()
    {
        return $this->hasMany(Company::class);
    }

    public function deals()
    {
        return $this->hasMany(Deal::class);
    }

    public function discussions()
    {
        return $this->hasMany(Discussion::class);
    }

    public function notes()
    {
        return $this->hasMany(Note::class);
    }

    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    public function tags()
    {
        return $this->hasMany(Tag::class);
    }

    public function entityLinks()
    {
        return $this->hasMany(EntityLink::class);
    }

    public function googleAccounts()
    {
        return $this->hasMany(UserGoogleAccount::class);
    }

    public function primaryGoogleAccount()
    {
        return $this->hasOne(UserGoogleAccount::class)->where('is_primary', true);
    }

    public function pushTokens()
    {
        return $this->hasMany(PushToken::class);
    }

    public function emailThreads()
    {
        return $this->hasMany(EmailThread::class);
    }
}
