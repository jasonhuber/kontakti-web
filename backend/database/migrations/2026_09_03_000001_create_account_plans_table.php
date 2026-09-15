<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('company_id')->constrained('companies')->cascadeOnDelete();
            $table->string('title');
            $table->enum('status', ['draft', 'active', 'paused', 'complete'])->default('draft');
            $table->text('objective')->nullable();
            $table->text('summary')->nullable();
            $table->json('known_context')->nullable();
            $table->json('risks')->nullable();
            $table->json('open_questions')->nullable();
            $table->json('messaging_angles')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'company_id'], 'uq_account_plans_user_company');
            $table->index(['user_id', 'status'], 'idx_account_plans_user_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_plans');
    }
};
