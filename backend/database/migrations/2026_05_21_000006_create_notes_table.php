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
            $table->timestampTz('synced_at')->nullable();
            $table->jsonb('metadata')->default('{}');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletesTz();
        });

        DB::statement("ALTER TABLE notes ADD COLUMN search_vector tsvector");
        DB::statement("
            CREATE OR REPLACE FUNCTION notes_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW.search_vector :=
                    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        ");
        DB::statement("
            CREATE TRIGGER notes_search_vector_trigger
            BEFORE INSERT OR UPDATE ON notes
            FOR EACH ROW EXECUTE FUNCTION notes_search_vector_update();
        ");
        DB::statement("CREATE INDEX idx_notes_fts ON notes USING gin(search_vector)");
        DB::statement("CREATE INDEX idx_notes_notable ON notes(notable_type, notable_id)");
    }

    public function down(): void
    {
        Schema::dropIfExists('notes');
    }
};
