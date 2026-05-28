<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('person_photos', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->char('person_id', 36);
            $table->string('url', 1024);
            $table->string('source', 32)->default('manual_upload');
            $table->boolean('is_primary')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('person_id')->references('id')->on('people')->cascadeOnDelete();
            $table->index(['person_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('person_photos');
    }
};
