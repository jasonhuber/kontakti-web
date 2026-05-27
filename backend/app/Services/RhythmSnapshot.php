<?php

namespace App\Services;

use Carbon\Carbon;

/**
 * Plain DTO describing the learned cadence between a user and a person,
 * derived from their Discussion history.
 */
class RhythmSnapshot
{
    public function __construct(
        public readonly int $interactionCount,
        public readonly ?float $meanIntervalDays,
        public readonly ?float $medianIntervalDays,
        public readonly ?float $stddevIntervalDays,
        public readonly ?Carbon $lastInteractionAt,
        public readonly ?int $daysSinceLast,
        public readonly ?float $cadenceZScore,
        public readonly string $state,        // active|stretching|broken|cold
        public readonly string $rhythmLabel,
        public readonly ?Carbon $computedAt = null,
    ) {}

    public function toArray(): array
    {
        return [
            'interaction_count'    => $this->interactionCount,
            'mean_interval_days'   => $this->meanIntervalDays,
            'median_interval_days' => $this->medianIntervalDays,
            'stddev_interval_days' => $this->stddevIntervalDays,
            'last_interaction_at'  => $this->lastInteractionAt?->toIso8601String(),
            'days_since_last'      => $this->daysSinceLast,
            'cadence_z_score'      => $this->cadenceZScore,
            'state'                => $this->state,
            'rhythm_label'         => $this->rhythmLabel,
            'computed_at'          => ($this->computedAt ?? now())->toIso8601String(),
        ];
    }

    public static function fromArray(array $data): self
    {
        return new self(
            interactionCount:    (int) ($data['interaction_count'] ?? 0),
            meanIntervalDays:    isset($data['mean_interval_days']) ? (float) $data['mean_interval_days'] : null,
            medianIntervalDays:  isset($data['median_interval_days']) ? (float) $data['median_interval_days'] : null,
            stddevIntervalDays:  isset($data['stddev_interval_days']) ? (float) $data['stddev_interval_days'] : null,
            lastInteractionAt:   !empty($data['last_interaction_at']) ? Carbon::parse($data['last_interaction_at']) : null,
            daysSinceLast:       isset($data['days_since_last']) ? (int) $data['days_since_last'] : null,
            cadenceZScore:       isset($data['cadence_z_score']) ? (float) $data['cadence_z_score'] : null,
            state:               $data['state'] ?? 'cold',
            rhythmLabel:         $data['rhythm_label'] ?? 'No history yet',
            computedAt:          !empty($data['computed_at']) ? Carbon::parse($data['computed_at']) : null,
        );
    }
}
