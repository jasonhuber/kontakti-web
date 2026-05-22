<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Support\Str;

class Tag extends Model
{
    use HasUuids;

    protected $fillable = ['user_id', 'name', 'slug', 'color'];

    protected static function booted(): void
    {
        static::creating(function (Tag $tag) {
            if (empty($tag->slug)) {
                $tag->slug = Str::slug($tag->name);
            }
        });
    }

    public function taggables(string $type): \Illuminate\Database\Eloquent\Collection
    {
        return $type::whereHas('tags', fn($q) => $q->where('tags.id', $this->id))->get();
    }
}
