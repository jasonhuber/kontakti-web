<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('google_contact_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('person_id', 36);
            // People API identifiers for the linked Google contact.
            $table->string('resource_name');           // e.g. "people/c12345"
            $table->string('etag')->nullable();         // required for updateContact
            $table->unsignedBigInteger('google_account_id')->nullable();
            $table->string('account_email')->nullable();
            $table->timestamp('last_pushed_at')->nullable();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['user_id', 'person_id']);
            $table->index(['user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('google_contact_links');
    }
};
