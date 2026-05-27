<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('people', function (Blueprint $table) {
            $table->date('birthday')->nullable()->after('phone');
            $table->string('nickname', 100)->nullable()->after('last_name');
            $table->string('job_department', 100)->nullable()->after('title');
            $table->json('addresses')->default('[]')->after('notes');
            $table->json('urls')->default('[]')->after('addresses');
            $table->text('device_note')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('people', function (Blueprint $table) {
            $table->dropColumn(['birthday', 'nickname', 'job_department', 'addresses', 'urls', 'device_note']);
        });
    }
};
