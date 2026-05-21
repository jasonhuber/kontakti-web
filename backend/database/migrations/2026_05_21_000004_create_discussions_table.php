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
            $table->timestampTz('date');
            $table->enum('type', ['call', 'meeting', 'email', 'message', 'event', 'other'])->default('meeting');
            $table->text('summary')->nullable();
            $table->text('body')->nullable(); // Markdown
            $table->foreignUuid('deal_id')->nullable()->constrained('deals')->nullOnDelete();
            $table->jsonb('metadata')->default('{}');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletesTz();
        });

        Schema::create('discussion_people', function (Blueprint $table) {
            $table->foreignUuid('discussion_id')->constrained('discussions')->cascadeOnDelete();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->primary(['discussion_id', 'person_id']);
            $table->timestampTz('created_at')->useCurrent();
        });

        DB::statement("ALTER TABLE discussions ADD COLUMN search_vector tsvector");
        DB::statement("
            CREATE OR REPLACE FUNCTION discussions_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW.search_vector :=
                    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'C');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        ");
        DB::statement("
            CREATE TRIGGER discussions_search_vector_trigger
            BEFORE INSERT OR UPDATE ON discussions
            FOR EACH ROW EXECUTE FUNCTION discussions_search_vector_update();
        ");
        DB::statement("CREATE INDEX idx_discussions_fts ON discussions USING gin(search_vector)");
        DB::statement("CREATE INDEX idx_discussions_date ON discussions(date DESC)");
    }

    public function down(): void
    {
        Schema::dropIfExists('discussion_people');
        Schema::dropIfExists('discussions');
    }
};
