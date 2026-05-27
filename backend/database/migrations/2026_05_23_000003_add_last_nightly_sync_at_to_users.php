<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'last_nightly_sync_at')) {
                $table->timestamp('last_nightly_sync_at')->nullable()->after('onboarded_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'last_nightly_sync_at')) {
                $table->dropColumn('last_nightly_sync_at');
            }
        });
    }
};
