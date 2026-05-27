<?php

namespace App\Services;

use App\Models\Person;
use Carbon\Carbon;

/**
 * Learns each (user, person) pair's actual cadence from Discussion history
 * and produces a RhythmSnapshot — mean/median/stddev intervals, a "state"
 * derived from how late the latest interaction is vs the learned mean, and
 * a human-readable label. Cached in people.metadata['rhythm'] for 24h and
 * invalidated by the DiscussionObserver on each new/updated discussion.
 */
class RelationshipRhythm
{
    public const CACHE_TTL_HOURS = 24;

    /**
     * State thresholds (in standard deviations above the mean).
     * Anything beyond `broken` is considered broken; >3× mean also counts.
     */
    public const STATE_STRETCHING_SIGMA = 1.0;
    public const STATE_BROKEN_SIGMA     = 2.0;
    public const BROKEN_MEAN_MULTIPLIER = 3.0;

    /**
     * Public API — return a RhythmSnapshot, using cached value when fresh.
     */
    public function forPerson(Person $person): RhythmSnapshot
    {
        $cached = $person->metadata['rhythm'] ?? null;
        if (is_array($cached) && !empty($cached['computed_at'])) {
            $age = Carbon::parse($cached['computed_at'])->diffInHours(now());
            if ($age < self::CACHE_TTL_HOURS) {
                // Refresh the "days_since_last" field without recomputing intervals.
                if (!empty($cached['last_interaction_at'])) {
                    $cached['days_since_last'] = (int) Carbon::parse($cached['last_interaction_at'])
                        ->startOfDay()
                        ->diffInDays(now()->startOfDay());
                    if ($cached['mean_interval_days'] && $cached['stddev_interval_days']) {
                        $cached['cadence_z_score'] = ($cached['days_since_last'] - $cached['mean_interval_days'])
                            / max(0.0001, (float) $cached['stddev_interval_days']);
                    }
                    $cached['state'] = $this->deriveState(
                        (int) $cached['interaction_count'],
                        $cached['mean_interval_days'] ?? null,
                        $cached['stddev_interval_days'] ?? null,
                        $cached['days_since_last'] ?? null,
                    );
                }
                return RhythmSnapshot::fromArray($cached);
            }
        }

        $snapshot = $this->compute($person);
        $this->cache($person, $snapshot);
        return $snapshot;
    }

    /**
     * Force a recompute and persist. Called by DiscussionObserver.
     */
    public function recompute(Person $person): RhythmSnapshot
    {
        $snapshot = $this->compute($person);
        $this->cache($person, $snapshot);
        return $snapshot;
    }

    /**
     * Invalidate the cached rhythm so the next read recomputes.
     */
    public function invalidate(Person $person): void
    {
        $meta = $person->metadata ?? [];
        if (isset($meta['rhythm'])) {
            unset($meta['rhythm']);
            $person->forceFill(['metadata' => $meta])->saveQuietly();
        }
    }

    /**
     * "Breaking point" score 0..1 — how broken the rhythm is right now.
     * Returns null when not enough history to compute (interaction_count < 3).
     */
    public function breakingPoint(Person $person): ?float
    {
        $snap = $this->forPerson($person);
        if ($snap->interactionCount < 3 || !$snap->meanIntervalDays || $snap->daysSinceLast === null) {
            return null;
        }

        // 1.0 means the gap is at or beyond `BROKEN_MEAN_MULTIPLIER × mean`.
        // Below mean: 0. Linear ramp from mean → broken threshold.
        $upper = self::BROKEN_MEAN_MULTIPLIER * $snap->meanIntervalDays;
        if ($snap->daysSinceLast <= $snap->meanIntervalDays) {
            // Slight ramp inside 1σ so "approaching mean" still ranks.
            $ratio = $snap->daysSinceLast / max(1.0, $snap->meanIntervalDays);
            return max(0.0, min(0.4, $ratio * 0.4));
        }
        $extra = $snap->daysSinceLast - $snap->meanIntervalDays;
        $span  = max(1.0, $upper - $snap->meanIntervalDays);
        return min(1.0, 0.4 + 0.6 * ($extra / $span));
    }

    // ─────────────────────────────────────────────────────────────────

    private function compute(Person $person): RhythmSnapshot
    {
        // Fetch all discussion dates this person participated in (ASC).
        $dates = $person->discussions()
            ->orderBy('discussions.date', 'asc')
            ->pluck('discussions.date')
            ->map(fn ($d) => $d instanceof Carbon ? $d : Carbon::parse($d))
            ->values();

        $count = $dates->count();

        if ($count === 0) {
            return new RhythmSnapshot(
                interactionCount:    0,
                meanIntervalDays:    null,
                medianIntervalDays:  null,
                stddevIntervalDays:  null,
                lastInteractionAt:   null,
                daysSinceLast:       null,
                cadenceZScore:       null,
                state:               'cold',
                rhythmLabel:         'No history yet',
                computedAt:          now(),
            );
        }

        $last = $dates->last();
        $daysSinceLast = (int) $last->copy()->startOfDay()->diffInDays(now()->startOfDay());

        if ($count === 1) {
            return new RhythmSnapshot(
                interactionCount:    1,
                meanIntervalDays:    null,
                medianIntervalDays:  null,
                stddevIntervalDays:  null,
                lastInteractionAt:   $last,
                daysSinceLast:       $daysSinceLast,
                cadenceZScore:       null,
                state:               'cold',
                rhythmLabel:         'One-off contact',
                computedAt:          now(),
            );
        }

        // Compute consecutive intervals in days.
        $intervals = [];
        for ($i = 1; $i < $count; $i++) {
            $delta = $dates[$i-1]->copy()->startOfDay()->diffInDays($dates[$i]->copy()->startOfDay());
            if ($delta > 0) {
                $intervals[] = (float) $delta;
            }
        }

        $mean = $median = $stddev = null;
        if (!empty($intervals)) {
            $mean = array_sum($intervals) / count($intervals);
            $sorted = $intervals; sort($sorted);
            $mid = intdiv(count($sorted), 2);
            $median = count($sorted) % 2
                ? $sorted[$mid]
                : ($sorted[$mid-1] + $sorted[$mid]) / 2.0;

            if (count($intervals) >= 2) {
                $variance = 0.0;
                foreach ($intervals as $v) { $variance += ($v - $mean) ** 2; }
                $variance /= (count($intervals) - 1); // sample stddev
                $stddev = sqrt($variance);
            }
        }

        // For count==2 we have mean but no stddev — still useful, but state
        // logic skips the z-score and falls back to multiplier checks.
        $z = ($mean && $stddev && $stddev > 0.0001)
            ? ($daysSinceLast - $mean) / $stddev
            : null;

        $state = $count >= 3
            ? $this->deriveState($count, $mean, $stddev, $daysSinceLast)
            : 'cold';

        return new RhythmSnapshot(
            interactionCount:    $count,
            meanIntervalDays:    $mean,
            medianIntervalDays:  $median,
            stddevIntervalDays:  $stddev,
            lastInteractionAt:   $last,
            daysSinceLast:       $daysSinceLast,
            cadenceZScore:       $z,
            state:               $state,
            rhythmLabel:         $this->labelFor($count, $mean, $median, $state),
            computedAt:          now(),
        );
    }

    private function deriveState(int $count, ?float $mean, ?float $stddev, ?int $daysSinceLast): string
    {
        if ($count < 2 || $mean === null || $daysSinceLast === null) {
            return 'cold';
        }
        // >3× mean is broken regardless of stddev shape.
        if ($daysSinceLast > self::BROKEN_MEAN_MULTIPLIER * $mean) {
            return 'broken';
        }
        if ($stddev && $stddev > 0.0001) {
            $z = ($daysSinceLast - $mean) / $stddev;
            if ($z > self::STATE_BROKEN_SIGMA) return 'broken';
            if ($z > self::STATE_STRETCHING_SIGMA) return 'stretching';
            return 'active';
        }
        // No stddev fallback (count==2): use multipliers.
        if ($daysSinceLast > 2 * $mean) return 'stretching';
        return 'active';
    }

    private function labelFor(int $count, ?float $mean, ?float $median, string $state): string
    {
        if ($count === 0) return 'No history yet';
        if ($count === 1) return 'One-off contact';
        if ($mean === null) return 'Sporadic';

        // Use the median to describe the typical cadence — robust to outliers.
        $typical = $median ?? $mean;
        $tense = match ($state) {
            'broken'     => 'Used to',
            'stretching' => 'Usually',
            default      => 'About every',
        };

        $cadenceWord = $this->cadenceWord($typical);
        return $tense === 'About every'
            ? "About every {$cadenceWord}"
            : "{$tense} chat {$cadenceWord}";
    }

    private function cadenceWord(float $days): string
    {
        if ($days < 3)        return 'every couple of days';
        if ($days < 9)        return 'weekly';
        if ($days < 18)       return 'every couple of weeks';
        if ($days < 40)       return 'monthly';
        if ($days < 75)       return 'every ~6 weeks';
        if ($days < 130)      return 'quarterly';
        if ($days < 220)      return 'twice a year';
        if ($days < 400)      return 'yearly';
        return 'rarely';
    }

    private function cache(Person $person, RhythmSnapshot $snapshot): void
    {
        $meta = $person->metadata ?? [];
        $meta['rhythm'] = $snapshot->toArray();
        $person->forceFill(['metadata' => $meta])->saveQuietly();
    }
}
