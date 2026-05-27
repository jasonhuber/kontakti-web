<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('people', function (Blueprint $table) {
            $table->boolean('do_not_contact')->default(false)->after('notes');
            $table->text('do_not_contact_reason')->nullable()->after('do_not_contact');
            $table->index('do_not_contact');
        });
    }

    public function down(): void
    {
        Schema::table('people', function (Blueprint $table) {
            $table->dropIndex(['do_not_contact']);
            $table->dropColumn(['do_not_contact', 'do_not_contact_reason']);
        });
    }
};
