<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_plan_items', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('account_plan_id')->constrained('account_plans')->cascadeOnDelete();
            $table->enum('type', ['next_step', 'milestone', 'risk', 'question', 'stakeholder_action'])->default('next_step');
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('status', ['todo', 'in_progress', 'done', 'dismissed'])->default('todo');
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            $table->date('due_at')->nullable();
            $table->foreignUuid('person_id')->nullable()->constrained('people')->nullOnDelete();
            $table->foreignUuid('task_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->string('source_type')->nullable();
            $table->string('source_id')->nullable();
            $table->uuid('operation_key')->nullable();
            $table->boolean('ai_generated')->default(false);
            $table->unsignedTinyInteger('ai_confidence')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['account_plan_id', 'status', 'due_at'], 'idx_plan_items_plan_status_due');
            $table->index(['person_id', 'status'], 'idx_plan_items_person_status');
            $table->unique(['account_plan_id', 'operation_key'], 'uq_plan_items_operation');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_plan_items');
    }
};
