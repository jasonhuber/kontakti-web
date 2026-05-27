<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_group_members', function (Blueprint $table) {
            $table->foreignUuid('social_group_id')->constrained('social_groups')->cascadeOnDelete();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->string('role', 50)->nullable();
            $table->timestamp('joined_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->primary(['social_group_id', 'person_id']);
            $table->index('person_id', 'idx_sgm_person');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_group_members');
    }
};
