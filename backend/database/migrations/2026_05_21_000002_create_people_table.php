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
            $table->timestampTz('last_contacted_at')->nullable();
            $table->timestampTz('next_followup_at')->nullable();
            $table->text('notes')->nullable();
            $table->jsonb('metadata')->default('{}');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletesTz();
        });

        DB::statement("ALTER TABLE people ADD COLUMN search_vector tsvector");
        DB::statement("
            CREATE OR REPLACE FUNCTION people_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW.search_vector :=
                    setweight(to_tsvector('english', coalesce(NEW.first_name, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.last_name, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.email, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'C') ||
                    setweight(to_tsvector('english', coalesce(NEW.notes, '')), 'D');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        ");
        DB::statement("
            CREATE TRIGGER people_search_vector_trigger
            BEFORE INSERT OR UPDATE ON people
            FOR EACH ROW EXECUTE FUNCTION people_search_vector_update();
        ");
        DB::statement("CREATE INDEX idx_people_fts ON people USING gin(search_vector)");
        DB::statement("CREATE INDEX idx_people_company ON people(company_id)");
        DB::statement("CREATE INDEX idx_people_followup ON people(next_followup_at) WHERE next_followup_at IS NOT NULL");
    }

    public function down(): void
    {
        Schema::dropIfExists('people');
    }
};
