<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_groups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('source', ['facebook_group', 'whatsapp_group', 'instagram_followers', 'manual']);
            $table->string('external_id', 255)->nullable();
            $table->string('name', 255);
            $table->integer('member_count')->default(0);
            $table->timestamp('last_synced_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['user_id', 'source', 'external_id'], 'uniq_social_groups_user_src_ext');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_groups');
    }
};
