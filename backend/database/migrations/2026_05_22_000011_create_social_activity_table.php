<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_activity', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('source', ['instagram', 'facebook', 'linkedin', 'twitter_x', 'tiktok']);
            $table->enum('kind', ['post', 'life_event', 'job_change', 'reaction', 'check_in', 'story_highlight']);
            $table->timestamp('occurred_at');
            $table->text('content')->nullable();
            $table->string('location', 255)->nullable();
            $table->string('image_url', 500)->nullable();
            $table->string('external_url', 500)->nullable();
            $table->json('engagement')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('cached_at')->useCurrent();
            $table->timestamp('acknowledged_at')->nullable();

            $table->index(['person_id', 'occurred_at'], 'idx_social_activity_person_occurred');
            $table->index(['user_id', 'occurred_at'], 'idx_social_activity_user_occurred');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_activity');
    }
};
