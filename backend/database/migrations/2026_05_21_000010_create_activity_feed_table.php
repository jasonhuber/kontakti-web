<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_feed', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('subject_type', 100); // what entity this is about
            $table->uuid('subject_id');
            // created, updated, deleted, contacted, stage_changed, note_added, task_completed
            $table->string('verb', 50);
            $table->string('object_type', 100)->nullable(); // optional second entity
            $table->uuid('object_id')->nullable();
            $table->jsonb('payload')->default('{}'); // diff, context, display data
            $table->timestampTz('created_at')->useCurrent();
        });

        DB::statement("CREATE INDEX idx_activity_subject ON activity_feed(subject_type, subject_id)");
        DB::statement("CREATE INDEX idx_activity_created ON activity_feed(created_at DESC)");
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_feed');
    }
};
