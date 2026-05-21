<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('domain', 255)->nullable()->unique();
            $table->string('logo_url', 500)->nullable();
            $table->string('industry', 100)->nullable();
            $table->string('size_range', 50)->nullable(); // "1-10", "51-200", etc.
            $table->string('linkedin_url', 500)->nullable();
            $table->string('website', 500)->nullable();
            $table->text('notes')->nullable();
            $table->json('metadata')->default('{}');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletes();

            // Full-text search index
            $table->fullText(['name', 'domain', 'industry', 'notes']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('companies');
    }
};
