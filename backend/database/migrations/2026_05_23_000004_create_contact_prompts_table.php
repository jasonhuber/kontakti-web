<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_prompts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->enum('question_key', [
                'recognize',
                'how_we_met',
                'relationship_type',
                'last_recall',
                'notable',
            ]);
            $table->text('question_text');
            $table->timestamp('shown_at')->useCurrent();
            $table->timestamp('answered_at')->nullable();
            $table->timestamp('skipped_at')->nullable();
            $table->text('answer')->nullable();
            $table->json('answer_structured')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index(['user_id', 'shown_at']);
            $table->index('person_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_prompts');
    }
};
