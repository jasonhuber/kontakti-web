<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Per-person contact cadence preference. Default 'biannual' (twice a year)
        // so every contact has a gentle default unless the user picks otherwise.
        Schema::table('people', function (Blueprint $table) {
            $table->enum('contact_cadence', ['none', 'monthly', 'quarterly', 'biannual', 'annual'])
                  ->default('biannual')->after('next_followup_at');
            $table->boolean('contact_on_birthday')->default(true)->after('contact_cadence');
            $table->boolean('contact_on_holidays')->default(false)->after('contact_on_birthday');
        });

        // Precomputed, queryable reach-out timeline. The nightly builder fills this
        // up to ~6 months out so suggestions never have to be computed on the fly.
        Schema::create('contact_schedule', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->date('due_at');
            $table->enum('reason', ['cadence', 'birthday', 'holiday']);
            $table->string('label', 120)->nullable();
            $table->enum('status', ['pending', 'done', 'snoozed', 'dismissed'])->default('pending');
            $table->date('snoozed_until')->nullable();
            $table->timestamps();

            // One entry per person/reason/date — lets the builder upsert idempotently.
            $table->unique(['person_id', 'reason', 'due_at'], 'uq_schedule_person_reason_due');
            // Primary query path: a user's pending items in date order.
            $table->index(['user_id', 'status', 'due_at'], 'idx_schedule_user_status_due');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_schedule');
        Schema::table('people', function (Blueprint $table) {
            $table->dropColumn(['contact_cadence', 'contact_on_birthday', 'contact_on_holidays']);
        });
    }
};
