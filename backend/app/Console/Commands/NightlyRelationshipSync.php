<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\{GmailSyncService, JobChangeDetector, PushDispatcher, SocialActivityRefresher, TodayInbox};
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The "ambient relationship engine" nightly loop:
 *   1. Pull Gmail threads → Discussions for each linked Google account.
 *   2. Detect LinkedIn job changes for tracked people.
 *   3. Refresh Instagram / Facebook social activity for people with handles.
 *   4. Build the Today inbox; if there's anything, send one summary push.
 *
 * Throttled: each user runs at most once per 20 hours.
 *
 * TODO: when users get a timezone/locale field, switch this to honour their
 * local 7am instead of UTC. For now we run once a day at 07:00 UTC and skip
 * anyone we already processed within the last 20h.
 */
class NightlyRelationshipSync extends Command
{
    public const THROTTLE_HOURS = 20;

    protected $signature = 'kontakti:nightly-sync {--user= : Limit to a single user id (debug)}';

    protected $description = 'Nightly ambient relationship sync: Gmail + LinkedIn + social + push.';

    public function __construct(
        private GmailSyncService $gmailSync,
        private JobChangeDetector $jobChanges,
        private SocialActivityRefresher $socialRefresher,
        private TodayInbox $todayInbox,
        private PushDispatcher $push,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $query = User::query()
            ->whereHas('googleAccounts')
            ->where(function ($q) {
                $q->whereNull('last_nightly_sync_at')
                  ->orWhere('last_nightly_sync_at', '<', now()->subHours(self::THROTTLE_HOURS));
            });

        if ($onlyUser = $this->option('user')) {
            $query->where('id', $onlyUser);
        }

        $users = $query->get();
        $this->info("Nightly sync: processing {$users->count()} user(s).");

        foreach ($users as $user) {
            $this->syncUser($user);
        }

        return self::SUCCESS;
    }

    private function syncUser(User $user): void
    {
        $this->line("→ user {$user->id} ({$user->email})");

        // 1) Gmail per linked account
        foreach ($user->googleAccounts as $account) {
            if (!$account->refresh_token) {
                continue; // can't sync without a refresh token
            }
            try {
                $r = $this->gmailSync->syncForAccount($account, 50);
                $this->line("   gmail[{$account->email}]: synced={$r['synced']} discussions={$r['discussions_created']} errors={$r['errors']}");
            } catch (\Throwable $e) {
                Log::warning('NightlySync gmail failed', [
                    'user_id' => $user->id, 'account_id' => $account->id, 'err' => $e->getMessage(),
                ]);
            }
        }

        // 2) Job changes
        try {
            $jr = $this->jobChanges->detectForUser($user);
            $this->line('   linkedin: ' . json_encode($jr));
        } catch (\Throwable $e) {
            Log::warning('NightlySync jobchange failed', ['user_id' => $user->id, 'err' => $e->getMessage()]);
        }

        // 3) Social activity refresh
        try {
            $sr = $this->socialRefresher->refreshForUser($user);
            $this->line('   social: ' . json_encode($sr));
        } catch (\Throwable $e) {
            Log::warning('NightlySync social failed', ['user_id' => $user->id, 'err' => $e->getMessage()]);
        }

        // 4) Build today inbox + push
        try {
            $items = $this->todayInbox->forUser($user, 20);

            // Cadence-based reach-outs due today (the "Reconnect" schedule), which
            // TodayInbox doesn't surface for contacts that have never been logged.
            // Mirror exactly what the app's reconnect panel surfaces (the `due()`
            // scope, excluding do-not-contact, one row per person) so the push count
            // never disagrees with what the user sees when they tap in.
            $dueReachOuts = \App\Models\ContactScheduleItem::where('user_id', $user->id)
                ->due()
                ->whereHas('person', fn ($q) => $q->where('do_not_contact', false))
                ->distinct('person_id')
                ->count('person_id');

            if (!empty($items) || $dueReachOuts > 0) {
                $kinds = [];
                foreach ($items as $i) {
                    $kinds[$i['kind']] = ($kinds[$i['kind']] ?? 0) + 1;
                }
                $parts = [];
                if (!empty($kinds)) {
                    $parts[] = $this->describeKinds($kinds);
                }
                if ($dueReachOuts > 0) {
                    $parts[] = $dueReachOuts . ($dueReachOuts === 1 ? ' person to reach out to' : ' people to reach out to');
                }
                $body  = implode(' · ', $parts);
                $count = count($items) + $dueReachOuts;
                $sent  = $this->push->send(
                    $user,
                    'Kontakti: ' . $count . ' reach-out' . ($count === 1 ? '' : 's') . ' today',
                    $body,
                    ['deeplink' => 'kontakti://today']
                );
                $this->line("   push: sent={$sent} body=\"{$body}\"");
            } else {
                $this->line('   push: skipped (nothing due)');
            }
        } catch (\Throwable $e) {
            Log::warning('NightlySync today/push failed', ['user_id' => $user->id, 'err' => $e->getMessage()]);
        }

        $user->forceFill(['last_nightly_sync_at' => now()])->save();
    }

    private function describeKinds(array $kinds): string
    {
        $pretty = [
            'birthday'         => ['birthday',  'birthdays'],
            'cadence_overdue'  => ['follow-up', 'follow-ups'],
            'follow_up_due'    => ['follow-up', 'follow-ups'],
            'job_change'       => ['job change','job changes'],
            'social_signal'    => ['signal',    'signals'],
        ];
        $parts = [];
        foreach ($kinds as $kind => $n) {
            [$one, $many] = $pretty[$kind] ?? [$kind, $kind . 's'];
            $parts[] = $n . ' ' . ($n === 1 ? $one : $many);
        }
        return implode(', ', $parts);
    }
}
