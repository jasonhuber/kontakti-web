<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'onboarded_at')) {
            Schema::table('users', function (Blueprint $table) {
                if (Schema::hasColumn('users', 'avatar_url')) {
                    $table->timestamp('onboarded_at')->nullable()->after('avatar_url');
                } else {
                    $table->timestamp('onboarded_at')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'onboarded_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('onboarded_at');
            });
        }
    }
};
