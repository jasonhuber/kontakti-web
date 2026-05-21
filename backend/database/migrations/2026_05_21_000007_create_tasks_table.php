<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->text('description')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            // Polymorphic: attach to Person, Deal, Company, Discussion, or standalone
            $table->string('taskable_type', 100)->nullable();
            $table->uuid('taskable_id')->nullable();
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
        });

        DB::statement("CREATE INDEX idx_tasks_taskable ON tasks(taskable_type, taskable_id)");
        DB::statement("CREATE INDEX idx_tasks_due ON tasks(due_at)");
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
