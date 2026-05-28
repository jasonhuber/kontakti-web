<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deal_contacts', function (Blueprint $table) {
            $table->timestamp('updated_at')
                ->default(\DB::raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'))
                ->after('created_at');
        });
    }

    public function down(): void
    {
        Schema::table('deal_contacts', function (Blueprint $table) {
            $table->dropColumn('updated_at');
        });
    }
};
