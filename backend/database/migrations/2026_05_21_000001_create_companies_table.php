<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

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
            $table->jsonb('metadata')->default('{}');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletesTz();
        });

        // Full-text search vector
        DB::statement("ALTER TABLE companies ADD COLUMN search_vector tsvector");
        DB::statement("
            CREATE OR REPLACE FUNCTION companies_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW.search_vector :=
                    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.domain, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(NEW.industry, '')), 'C') ||
                    setweight(to_tsvector('english', coalesce(NEW.notes, '')), 'D');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        ");
        DB::statement("
            CREATE TRIGGER companies_search_vector_trigger
            BEFORE INSERT OR UPDATE ON companies
            FOR EACH ROW EXECUTE FUNCTION companies_search_vector_update();
        ");
        DB::statement("CREATE INDEX idx_companies_fts ON companies USING gin(search_vector)");
    }

    public function down(): void
    {
        Schema::dropIfExists('companies');
    }
};
