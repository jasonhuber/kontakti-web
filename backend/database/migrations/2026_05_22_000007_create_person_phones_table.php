<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema, DB};
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('person_phones', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('person_id')->constrained('people')->cascadeOnDelete();
            $table->string('value', 255);
            $table->enum('label', ['mobile', 'work', 'home', 'other'])->default('mobile');
            $table->boolean('is_primary')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index('person_id');
            $table->index(['person_id', 'is_primary']);
        });

        // Backfill from people.phone
        $rows = DB::table('people')->whereNotNull('phone')->select('id', 'phone')->get();
        $now = now();
        foreach ($rows as $row) {
            DB::table('person_phones')->insert([
                'id'         => (string) Str::uuid(),
                'person_id'  => $row->id,
                'value'      => $row->phone,
                'label'      => 'mobile',
                'is_primary' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('person_phones');
    }
};
