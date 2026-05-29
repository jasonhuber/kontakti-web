<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('people', function (Blueprint $table) {
            // Set true when the row was imported or otherwise needs a human pass
            // (missing fields, suspect email, etc.). Cleared when reviewed_at fills.
            $table->boolean('needs_review')->default(false)->after('do_not_contact_reason');
            $table->timestamp('reviewed_at')->nullable()->after('needs_review');
            $table->index('needs_review');
        });
    }

    public function down(): void
    {
        Schema::table('people', function (Blueprint $table) {
            $table->dropIndex(['needs_review']);
            $table->dropColumn(['needs_review', 'reviewed_at']);
        });
    }
};
