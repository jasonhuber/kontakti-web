<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('people', function (Blueprint $table) {
            $table->string('instagram_handle', 100)->nullable()->after('linkedin_url');
            $table->string('facebook_url', 500)->nullable()->after('instagram_handle');
            $table->string('twitter_x_handle', 100)->nullable()->after('facebook_url');
            $table->string('tiktok_handle', 100)->nullable()->after('twitter_x_handle');
            $table->string('whatsapp_phone', 50)->nullable()->after('tiktok_handle');
            $table->json('previous_employers')->default('[]')->after('job_department');
            $table->string('city', 150)->nullable()->after('previous_employers');
            $table->string('region', 150)->nullable()->after('city');
            $table->string('country', 100)->nullable()->after('region');
            $table->text('how_we_met')->nullable()->after('country');
            $table->foreignUuid('introduced_by_id')->nullable()->after('how_we_met')
                ->constrained('people')->nullOnDelete();
            $table->timestamp('linkedin_last_scraped_at')->nullable()->after('introduced_by_id');
            $table->json('linkedin_snapshot')->nullable()->after('linkedin_last_scraped_at');

            $table->index('instagram_handle', 'idx_people_instagram_handle');
            $table->index('whatsapp_phone', 'idx_people_whatsapp_phone');
        });
    }

    public function down(): void
    {
        Schema::table('people', function (Blueprint $table) {
            $table->dropIndex('idx_people_instagram_handle');
            $table->dropIndex('idx_people_whatsapp_phone');
            $table->dropForeign(['introduced_by_id']);
            $table->dropColumn([
                'instagram_handle', 'facebook_url', 'twitter_x_handle', 'tiktok_handle',
                'whatsapp_phone', 'previous_employers', 'city', 'region', 'country',
                'how_we_met', 'introduced_by_id', 'linkedin_last_scraped_at', 'linkedin_snapshot',
            ]);
        });
    }
};
