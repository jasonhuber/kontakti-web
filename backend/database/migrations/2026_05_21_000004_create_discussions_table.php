<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('discussions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->timestamp('date');
            $table->enum('type', ['call', 'meeting', 'email', 'message', 'event', 'other'])->default('meeting');
            $table->text('summary')->nullable();
            $table->text('body')->nullable(); // Markdown
            $table->foreignUuid('deal_id')->nullable()->constrained('deals')->nullOnDelete();
            $table->json('metadata')->default('{}');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletes();

            // Full-text search index
            $table->fullText(['title', 'summary', 'body']);
        });

        Schema::create('discussion_people', function (Blueprint $table) {
            $table->foreignUuid('discussion_id')->constrained('discussions')->cascadeOnDelete();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->primary(['discussion_id', 'person_id']);
            $table->timestamp('created_at')->useCurrent();
        });

        DB::statement("CREATE INDEX idx_discussions_date ON discussions(date DESC)");
    }

    public function down(): void
    {
        Schema::dropIfExists('discussion_people');
        Schema::dropIfExists('discussions');
    }
};
