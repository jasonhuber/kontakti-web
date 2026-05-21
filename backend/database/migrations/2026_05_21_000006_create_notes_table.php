<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title')->nullable();
            $table->text('body'); // Markdown
            // Polymorphic: Person, Company, Discussion, Deal, or null (standalone)
            $table->string('notable_type', 100)->nullable();
            $table->uuid('notable_id')->nullable();
            $table->string('obsidian_path', 500)->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->json('metadata')->default('{}');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletes();

            // Full-text search index
            $table->fullText(['title', 'body']);
        });

        DB::statement("CREATE INDEX idx_notes_notable ON notes(notable_type, notable_id)");
    }

    public function down(): void
    {
        Schema::dropIfExists('notes');
    }
};
