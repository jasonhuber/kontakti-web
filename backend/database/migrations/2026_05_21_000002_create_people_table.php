<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('people', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('first_name', 100);
            $table->string('last_name', 100);
            $table->string('email', 255)->nullable()->unique();
            $table->string('phone', 50)->nullable();
            $table->string('linkedin_url', 500)->nullable();
            $table->string('avatar_url', 500)->nullable();
            $table->foreignUuid('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->string('title', 200)->nullable();
            $table->enum('relationship_strength', ['cold', 'warm', 'hot', 'close'])->default('cold');
            $table->timestamp('last_contacted_at')->nullable();
            $table->timestamp('next_followup_at')->nullable();
            $table->text('notes')->nullable();
            $table->json('metadata')->default('{}');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletes();

            // Full-text search index
            $table->fullText(['first_name', 'last_name', 'email', 'title', 'notes']);
        });

        DB::statement("CREATE INDEX idx_people_company ON people(company_id)");
        DB::statement("CREATE INDEX idx_people_followup ON people(next_followup_at)");
    }

    public function down(): void
    {
        Schema::dropIfExists('people');
    }
};
