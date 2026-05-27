<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('user_google_accounts')) {
            Schema::create('user_google_accounts', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->foreignId('user_id')
                    ->constrained('users')
                    ->cascadeOnDelete();
                $table->string('google_id')->unique();
                $table->string('email');
                $table->string('label')->default('personal');
                $table->boolean('is_primary')->default(false);
                $table->string('avatar_url')->nullable();
                $table->text('access_token')->nullable();
                $table->text('refresh_token')->nullable();
                $table->timestamp('token_expires_at')->nullable();
                $table->timestamp('last_synced_at')->nullable();
                $table->timestamps();

                $table->index('user_id');
                $table->index('email');
            });
        }

        // Backfill: every user with a google_id becomes their own primary account.
        if (Schema::hasColumn('users', 'google_id')) {
            $now = now();
            $users = DB::table('users')
                ->whereNotNull('google_id')
                ->select('id', 'google_id', 'email', 'avatar_url')
                ->get();

            foreach ($users as $u) {
                $exists = DB::table('user_google_accounts')
                    ->where('google_id', $u->google_id)
                    ->exists();

                if ($exists) {
                    continue;
                }

                DB::table('user_google_accounts')->insert([
                    'user_id'    => $u->id,
                    'google_id'  => $u->google_id,
                    'email'      => $u->email,
                    'label'      => 'personal',
                    'is_primary' => true,
                    'avatar_url' => $u->avatar_url,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_google_accounts');
    }
};
