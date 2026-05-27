<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('duplicate_candidates', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('group_key');
            $table->json('person_ids');
            $table->string('status')->default('pending'); // pending|merged|dismissed|kept_separate
            $table->json('ai_decision')->nullable();
            $table->float('ai_confidence')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index('user_id');
            $table->index('group_key');
            $table->index('ai_confidence');
            $table->unique(['user_id', 'group_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('duplicate_candidates');
    }
};
