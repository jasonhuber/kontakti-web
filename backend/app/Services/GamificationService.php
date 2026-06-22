<?php

namespace App\Services;

use App\Models\{User, ReachOutLog};
use Carbon\Carbon;

/**
 * Turns the existing relationship data (reach_out_log, per-person cadence, tasks)
 * into a "relationship fitness" game: a 0-100 score, a weekly goal, a streak,
 * XP/levels, achievements, and a contextual encouragement line.
 *
 * Everything is computed on the fly — there is no gamification table. The inputs
 * are the same fields the Reconnect / Today / Contact-schedule surfaces already
 * read, so the numbers stay consistent with the rest of the app.
 */
class GamificationService
{
    /** Mirrors PeopleController::reconnect — keep cadence math identical app-wide. */
    private const CADENCE_DAYS = ['none' => null, 'monthly' => 30, 'quarterly' => 90, 'biannual' => 182, 'annual' => 365];

    public function dashboardFor(User $user): array
    {
        // — People: in-touch + curation health —
        $people = $user->people()->get([
            'id', 'first_name', 'last_name', 'email', 'phone',
            'last_contacted_at', 'contact_cadence', 'do_not_contact',
            'needs_review', 'reviewed_at',
        ]);

        $total = $people->count();
        $tracked = 0;            // people with a real cadence + reachable
        $onCadence = 0;          // tracked people seen within their cadence window
        $overdue = 0;            // tracked people past their window (incl. never contacted)
        $neverContacted = 0;     // tracked people with no logged contact
        $needsCuration = 0;      // anyone flagged or missing core fields
        $reviewed = 0;           // people with a reviewed_at stamp

        foreach ($people as $p) {
            if ($p->reviewed_at) {
                $reviewed++;
            }
            $missingName    = trim((string) $p->first_name) === '' || trim((string) $p->last_name) === '';
            $missingContact = trim((string) $p->email) === '' && trim((string) $p->phone) === '';
            if ($p->needs_review || $missingName || $missingContact) {
                $needsCuration++;
            }

            if ($p->do_not_contact) {
                continue;
            }
            $target = self::CADENCE_DAYS[$p->contact_cadence] ?? null;
            if ($target === null) {
                continue; // no cadence set — not part of the "keeping in touch" denominator
            }
            $tracked++;
            $days = $p->last_contacted_at ? (int) now()->diffInDays($p->last_contacted_at) : null;
            if ($days !== null && $days <= $target) {
                $onCadence++;
            } else {
                $overdue++;
                if ($days === null) {
                    $neverContacted++;
                }
            }
        }

        $inTouchScore   = $tracked > 0 ? (int) round(100 * $onCadence / $tracked) : null;
        $curationDone   = $total - $needsCuration;
        $curationScore  = $total > 0 ? (int) round(100 * $curationDone / $total) : null;

        if ($total === 0) {
            $fitness = null;
        } elseif ($tracked === 0) {
            $fitness = $curationScore;
        } else {
            $fitness = (int) round(0.65 * $inTouchScore + 0.35 * $curationScore);
        }

        // — Outreach log: streak, this-week activity, lifetime volume —
        $logs = ReachOutLog::where('user_id', $user->id)
            ->whereNotNull('created_at')
            ->get(['person_id', 'created_at']);

        $lifetime = $logs->count();

        $weekStart      = now()->startOfWeek();
        $thisWeekLogs   = $logs->filter(fn ($l) => $l->created_at->gte($weekStart));
        $weekOutreach   = $thisWeekLogs->count();
        $weekPeople     = $thisWeekLogs->pluck('person_id')->unique()->count();
        $weekActiveDays = $thisWeekLogs->map(fn ($l) => $l->created_at->toDateString())->unique()->count();

        [$currentStreak, $longestStreak, $atRisk] = $this->weeklyStreak($logs);

        // — XP + level —
        $tasksCompleted = $user->tasks()->whereNotNull('completed_at')->count();
        $xp = $lifetime * 10 + $reviewed * 5 + $tasksCompleted * 15;
        [$level, $xpIntoLevel, $xpForNext] = $this->level($xp);

        // — Weekly goal: reach out to N distinct people; N scales with the backlog —
        $goalTarget   = $tracked > 0 ? max(3, min($overdue, 8)) : 3;
        $goalProgress = $weekPeople;
        $goalRemaining = max(0, $goalTarget - $goalProgress);

        return [
            'fitness_score' => $fitness,
            'in_touch' => [
                'score'           => $inTouchScore,
                'tracked'         => $tracked,
                'on_cadence'      => $onCadence,
                'overdue'         => $overdue,
                'never_contacted' => $neverContacted,
            ],
            'curation' => [
                'score'           => $curationScore,
                'total'           => $total,
                'complete'        => $curationDone,
                'needs_attention' => $needsCuration,
            ],
            'streak' => [
                'current_weeks'        => $currentStreak,
                'longest_weeks'        => $longestStreak,
                'at_risk'              => $atRisk,
                'this_week_outreach'   => $weekOutreach,
                'this_week_active_days' => $weekActiveDays,
            ],
            'level' => [
                'level'         => $level,
                'title'         => $this->levelTitle($level),
                'xp'            => $xp,
                'xp_into_level' => $xpIntoLevel,
                'xp_for_next'   => $xpForNext,
            ],
            'goal' => [
                'title'     => 'Reach out to ' . $goalTarget . ' ' . ($goalTarget === 1 ? 'person' : 'people') . ' this week',
                'target'    => $goalTarget,
                'progress'  => $goalProgress,
                'remaining' => $goalRemaining,
                'period'    => 'week',
            ],
            'totals' => [
                'people'            => $total,
                'outreach_lifetime' => $lifetime,
                'reviewed'          => $reviewed,
                'tasks_completed'   => $tasksCompleted,
            ],
            'achievements' => $this->achievements([
                'lifetime'       => $lifetime,
                'current_streak' => $currentStreak,
                'longest_streak' => $longestStreak,
                'reviewed'       => $reviewed,
                'total'          => $total,
                'tracked'        => $tracked,
                'overdue'        => $overdue,
                'fitness'        => $fitness,
            ]),
            'encouragement' => $this->encouragement([
                'at_risk'        => $atRisk,
                'current_streak' => $currentStreak,
                'tracked'        => $tracked,
                'overdue'        => $overdue,
                'goal_target'    => $goalTarget,
                'lifetime'       => $lifetime,
            ]),
        ];
    }

    /**
     * Consecutive ISO weeks (Mon-start) with at least one logged outreach.
     * Returns [currentStreak, longestStreak, atRisk]. "At risk" means the run
     * ended last week and this week has no outreach yet — still savable today.
     *
     * @return array{0:int,1:int,2:bool}
     */
    private function weeklyStreak($logs): array
    {
        $weekStarts = $logs
            ->map(fn ($l) => $l->created_at->copy()->startOfWeek()->toDateString())
            ->unique()
            ->values();

        if ($weekStarts->isEmpty()) {
            return [0, 0, false];
        }

        $weekSet = array_flip($weekStarts->all());

        // Current streak: count back from this week, else fall back to last week.
        $current = 0;
        $atRisk  = false;
        $cursor  = now()->startOfWeek();
        if (isset($weekSet[$cursor->toDateString()])) {
            while (isset($weekSet[$cursor->toDateString()])) {
                $current++;
                $cursor->subWeek();
            }
        } else {
            $cursor = now()->startOfWeek()->subWeek();
            if (isset($weekSet[$cursor->toDateString()])) {
                $atRisk = true;
                while (isset($weekSet[$cursor->toDateString()])) {
                    $current++;
                    $cursor->subWeek();
                }
            }
        }

        // Longest run anywhere in the history.
        $sorted = $weekStarts->map(fn ($d) => Carbon::parse($d))->sort()->values();
        $longest = 0;
        $run = 0;
        $prev = null;
        foreach ($sorted as $d) {
            if ($prev !== null && $prev->copy()->addWeek()->isSameDay($d)) {
                $run++;
            } else {
                $run = 1;
            }
            $longest = max($longest, $run);
            $prev = $d;
        }

        return [$current, $longest, $atRisk];
    }

    /**
     * Triangular level curve: level L needs 100 * L*(L-1)/2 cumulative XP, so
     * each level costs a little more than the last.
     *
     * @return array{0:int,1:int,2:int} [level, xpIntoLevel, xpForNext]
     */
    private function level(int $xp): array
    {
        $level = 1;
        $base = 0;
        $need = 100;
        while ($xp >= $base + $need) {
            $base += $need;
            $level++;
            $need = 100 * $level;
        }
        return [$level, $xp - $base, $need];
    }

    private function levelTitle(int $level): string
    {
        return match (true) {
            $level >= 10 => 'Relationship Legend',
            $level >= 8  => 'Relationship Master',
            $level >= 6  => 'Trusted Confidant',
            $level >= 4  => 'Relationship Builder',
            $level >= 3  => 'Networker',
            $level >= 2  => 'Connector',
            default      => 'Acquaintance',
        };
    }

    private function achievements(array $s): array
    {
        $streakBest = max($s['current_streak'], $s['longest_streak']);

        return [
            $this->badge('first_touch', 'First Touch', 'Log your first outreach.', 'Handshake',
                $s['lifetime'] >= 1, $s['lifetime'], 1),
            $this->badge('momentum', 'Month of Momentum', 'Keep a 4-week reach-out streak.', 'Flame',
                $streakBest >= 4, $streakBest, 4),
            $this->badge('quarter_champ', 'Quarter Champion', 'String together a 12-week streak.', 'Trophy',
                $s['longest_streak'] >= 12, $s['longest_streak'], 12),
            $this->badge('curator', 'Curator', 'Review 25 contacts.', 'Sparkles',
                $s['reviewed'] >= 25, $s['reviewed'], 25),
            $this->badge('centurion', 'Centurion', 'Grow your circle to 100 people.', 'Users',
                $s['total'] >= 100, $s['total'], 100),
            $this->badge('caught_up', 'All Caught Up', 'Get to zero overdue contacts.', 'CheckCircle2',
                $s['tracked'] > 0 && $s['overdue'] === 0, $s['tracked'] > 0 ? ($s['tracked'] - $s['overdue']) : 0, max($s['tracked'], 1)),
            $this->badge('in_shape', 'In Great Shape', 'Hit a fitness score of 80+.', 'HeartPulse',
                $s['fitness'] !== null && $s['fitness'] >= 80, $s['fitness'] ?? 0, 80),
            $this->badge('reconnector', 'Reconnector', 'Log 50 outreaches.', 'Send',
                $s['lifetime'] >= 50, $s['lifetime'], 50),
        ];
    }

    private function badge(string $key, string $title, string $desc, string $icon, bool $earned, int $current, int $target): array
    {
        return [
            'key'         => $key,
            'title'       => $title,
            'description' => $desc,
            'icon'        => $icon,
            'earned'      => $earned,
            'progress'    => ['current' => min($current, $target), 'target' => $target],
        ];
    }

    private function encouragement(array $s): array
    {
        $overdue = $s['overdue'];
        $verb = $overdue === 1 ? 'person is' : 'people are';

        if ($s['at_risk'] && $s['current_streak'] >= 1) {
            return [
                'message' => "Your {$s['current_streak']}-week streak is on the line. One outreach this week keeps the chain alive.",
                'tone'    => 'urgent',
            ];
        }
        if ($s['current_streak'] >= 4) {
            return [
                'message' => "{$s['current_streak']} weeks running. This is what consistency looks like — keep it going.",
                'tone'    => 'celebrate',
            ];
        }
        if ($s['tracked'] > 0 && $overdue > 0) {
            $hit = min($overdue, $s['goal_target']);
            return [
                'message' => "{$overdue} {$verb} slipping past cadence. Reach {$hit} this week and you're back in the green.",
                'tone'    => 'nudge',
            ];
        }
        if ($s['tracked'] === 0) {
            return [
                'message' => 'Set a contact cadence on a few people and your relationship score comes alive.',
                'tone'    => 'setup',
            ];
        }
        if ($s['tracked'] > 0 && $overdue === 0) {
            return [
                'message' => "Everyone's current. Rare air — protect it.",
                'tone'    => 'celebrate',
            ];
        }
        return [
            'message' => "You've logged {$s['lifetime']} touches. Keep showing up — it compounds.",
            'tone'    => 'steady',
        ];
    }
}
