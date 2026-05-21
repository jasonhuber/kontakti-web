<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deal_contacts', function (Blueprint $table) {
            $table->foreignUuid('deal_id')->constrained('deals')->cascadeOnDelete();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->string('role', 100)->nullable(); // champion, decision_maker, influencer, user, blocker
            $table->primary(['deal_id', 'person_id']);
            $table->timestampTz('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deal_contacts');
    }
};
