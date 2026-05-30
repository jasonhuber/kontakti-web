<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\ContactScheduleBuilder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Rebuilds the precomputed contact timeline for every user. Runs daily,
 * independent of the Gmail-gated nightly relationship sync, so the
 * "who should I reach out to" repository stays fresh for ALL users.
 */
class RebuildContactSchedule extends Command
{
    protected $signature = 'kontakti:rebuild-contact-schedule {--user= : Limit to a single user id (debug)}';

    protected $description = 'Rebuild the precomputed per-person contact schedule (cadence + birthdays + holidays), 6 months out.';

    public function handle(ContactScheduleBuilder $builder): int
    {
        $query = User::query();
        if ($only = $this->option('user')) {
            $query->where('id', $only);
        }
        $users = $query->get();

        $this->info("Rebuilding contact schedule for {$users->count()} user(s).");
        $total = 0;

        foreach ($users as $user) {
            try {
                $count = $builder->rebuildForUser($user);
                $total += $count;
                $this->line("  user {$user->id}: {$count} scheduled item(s)");
            } catch (\Throwable $e) {
                Log::error('Contact schedule rebuild failed', ['user' => $user->id, 'err' => $e->getMessage()]);
                $this->error("  user {$user->id}: {$e->getMessage()}");
            }
        }

        $this->info("Done. {$total} scheduled item(s) across all users.");
        return self::SUCCESS;
    }
}
