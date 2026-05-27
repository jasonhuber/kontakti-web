<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany, BelongsToMany, MorphMany};
use Illuminate\Database\Eloquent\Builder;

class Person extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'user_id',
        'first_name', 'last_name', 'nickname', 'email', 'phone',
        'linkedin_url', 'avatar_url', 'company_id', 'title', 'job_department',
        'relationship_strength', 'last_contacted_at', 'next_followup_at',
        'birthday',
        'notes', 'device_note', 'addresses', 'urls', 'metadata',
        'do_not_contact', 'do_not_contact_reason',
        // Social handles + relational metadata
        'instagram_handle', 'facebook_url', 'twitter_x_handle', 'tiktok_handle',
        'whatsapp_phone', 'previous_employers', 'city', 'region', 'country',
        'how_we_met', 'introduced_by_id',
        'linkedin_last_scraped_at', 'linkedin_snapshot',
    ];

    protected $casts = [
        'metadata'                 => 'array',
        'addresses'                => 'array',
        'urls'                     => 'array',
        'birthday'                 => 'date',
        'last_contacted_at'        => 'datetime',
        'next_followup_at'         => 'datetime',
        'previous_employers'       => 'array',
        'linkedin_snapshot'        => 'array',
        'linkedin_last_scraped_at' => 'datetime',
        'do_not_contact'           => 'boolean',
    ];

    protected $appends = [
        'full_name',
    ];

    // — Relationships —

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function discussions(): BelongsToMany
    {
        return $this->belongsToMany(Discussion::class, 'discussion_people')
            ->withTimestamps()
            ->latest('discussions.date');
    }

    public function deals(): BelongsToMany
    {
        return $this->belongsToMany(Deal::class, 'deal_contacts')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'notable');
    }

    public function tasks(): MorphMany
    {
        return $this->morphMany(Task::class, 'taskable');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'taggables', 'taggable_id', 'tag_id')
            ->wherePivot('taggable_type', self::class);
    }

    public function emails(): HasMany
    {
        return $this->hasMany(PersonEmail::class);
    }

    public function phones(): HasMany
    {
        return $this->hasMany(PersonPhone::class);
    }

    public function socialGroups(): BelongsToMany
    {
        return $this->belongsToMany(SocialGroup::class, 'social_group_members')
            ->withPivot(['role', 'joined_at']);
    }

    public function activity(): HasMany
    {
        return $this->hasMany(SocialActivity::class)->orderByDesc('occurred_at');
    }

    public function reachOutLogs(): HasMany
    {
        return $this->hasMany(ReachOutLog::class);
    }

    public function introducedBy(): BelongsTo
    {
        return $this->belongsTo(Person::class, 'introduced_by_id');
    }

    public function introductions(): HasMany
    {
        return $this->hasMany(Person::class, 'introduced_by_id');
    }

    /**
     * Mirror the primary email/phone from related tables into the legacy
     * top-level columns so back-compat clients keep working.
     */
    public function syncPrimaryContactColumns(): void
    {
        $primaryEmail = $this->emails()->where('is_primary', true)->first()
            ?? $this->emails()->first();
        $primaryPhone = $this->phones()->where('is_primary', true)->first()
            ?? $this->phones()->first();

        $this->email = $primaryEmail?->value;
        $this->phone = $primaryPhone?->value;
    }

    // — Computed attributes —

    public function getFullNameAttribute(): string
    {
        return "{$this->first_name} {$this->last_name}";
    }

    public function getObsidianLinkAttribute(): string
    {
        return "[[{$this->full_name}]]";
    }

    // — Scopes —

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->whereNotNull('next_followup_at')
            ->where('next_followup_at', '<', now());
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        return $query->whereRaw(
            "MATCH(first_name, last_name, email, title, notes) AGAINST (? IN BOOLEAN MODE)",
            [$term . '*']
        );
    }

    // — Activity logging —

    protected static function booted(): void
    {
        static::saved(function (Person $person) {
            ActivityFeedItem::log('person', $person->id, $person->wasRecentlyCreated ? 'created' : 'updated');
        });
    }
}
