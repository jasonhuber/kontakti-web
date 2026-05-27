<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_tokens', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('platform', ['ios', 'web', 'android']);
            $table->text('token');
            $table->string('device_id', 120)->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index(['user_id', 'enabled']);
        });

        // Unique on (user_id, platform, token(255)) — raw because Laravel can't
        // express the prefix length on a TEXT column in unique().
        DB::statement('CREATE UNIQUE INDEX uniq_push_token ON push_tokens (user_id, platform, token(255))');
    }

    public function down(): void
    {
        Schema::dropIfExists('push_tokens');
    }
};
