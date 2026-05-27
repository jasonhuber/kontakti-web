<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_threads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // user_google_accounts.id is bigIncrements (see 2026_05_22_000003 migration),
            // not a uuid. We mirror that here.
            $table->foreignId('user_google_account_id')
                ->constrained('user_google_accounts')
                ->cascadeOnDelete();
            $table->string('gmail_thread_id', 80);
            $table->string('subject', 500)->nullable();
            $table->text('snippet')->nullable();
            $table->json('participants_emails')->nullable();
            $table->unsignedInteger('message_count')->default(0);
            $table->timestamp('first_message_at')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->foreignUuid('discussion_id')->nullable()
                ->constrained('discussions')->nullOnDelete();
            $table->timestamp('synced_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['user_google_account_id', 'gmail_thread_id'], 'uniq_email_thread_per_account');
            $table->index(['user_id', 'last_message_at'], 'idx_email_threads_user_lastmsg');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_threads');
    }
};
