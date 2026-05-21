<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        // Flexible graph edges between any two entities
        Schema::create('entity_links', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('source_type', 100); // App\Models\Person
            $table->uuid('source_id');
            $table->string('target_type', 100);
            $table->uuid('target_id');
            // knows, reports_to, investor, advisor_to, works_with, introduced_by, etc.
            $table->string('relationship_type', 100)->default('knows');
            $table->text('notes')->nullable();
            $table->timestampTz('created_at')->useCurrent();
        });

        DB::statement("CREATE INDEX idx_entity_links_source ON entity_links(source_type, source_id)");
        DB::statement("CREATE INDEX idx_entity_links_target ON entity_links(target_type, target_id)");
    }

    public function down(): void
    {
        Schema::dropIfExists('entity_links');
    }
};
