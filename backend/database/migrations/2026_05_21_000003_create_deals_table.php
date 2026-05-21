<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deals', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('stage', [
                'discovery',
                'qualified',
                'proposal',
                'negotiation',
                'closed_won',
                'closed_lost',
                'on_hold',
            ])->default('discovery');
            $table->decimal('value', 15, 2)->nullable();
            $table->char('currency', 3)->default('USD');
            $table->foreignUuid('company_id')->nullable()->constrained('companies')->nullOnDelete();
            $table->date('expected_close_date')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->integer('pipeline_position')->default(0);
            $table->json('metadata')->default('{}');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->softDeletes();
        });

        DB::statement("CREATE INDEX idx_deals_stage ON deals(stage)");
        DB::statement("CREATE INDEX idx_deals_pipeline ON deals(stage, pipeline_position)");
    }

    public function down(): void
    {
        Schema::dropIfExists('deals');
    }
};
