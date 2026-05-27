<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reach_out_log', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->enum('via', ['email', 'phone', 'sms', 'imessage', 'whatsapp', 'instagram', 'facebook', 'in_person', 'other']);
            $table->string('reason', 50)->nullable();
            $table->text('note')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'created_at'], 'idx_reach_out_log_user_created');
            $table->index(['person_id', 'created_at'], 'idx_reach_out_log_person_created');
        });

        // MySQL trigger: on INSERT, bump last_contacted_at and clear next_followup_at
        // when the reason is 'follow_up'. Wrapped in DB::unprepared so the BEGIN/END
        // block survives.
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER trg_reach_out_log_after_insert
            AFTER INSERT ON reach_out_log
            FOR EACH ROW
            BEGIN
                UPDATE people
                SET last_contacted_at = NEW.created_at,
                    next_followup_at = CASE WHEN NEW.reason = 'follow_up' THEN NULL ELSE next_followup_at END
                WHERE id = NEW.person_id;
            END
        SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS trg_reach_out_log_after_insert');
        Schema::dropIfExists('reach_out_log');
    }
};
