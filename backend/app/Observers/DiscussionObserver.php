<?php

namespace App\Observers;

use App\Models\Discussion;
use App\Services\RelationshipRhythm;

class DiscussionObserver
{
    public function __construct(private RelationshipRhythm $rhythm) {}

    public function created(Discussion $discussion): void
    {
        $this->invalidateParticipants($discussion);
    }

    public function updated(Discussion $discussion): void
    {
        // Only invalidate if the date moved — title/summary edits don't change cadence.
        if ($discussion->wasChanged('date')) {
            $this->invalidateParticipants($discussion);
        }
    }

    public function deleted(Discussion $discussion): void
    {
        $this->invalidateParticipants($discussion);
    }

    private function invalidateParticipants(Discussion $discussion): void
    {
        foreach ($discussion->participants()->get() as $person) {
            $this->rhythm->invalidate($person);
        }
    }
}
