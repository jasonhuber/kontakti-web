<?php

namespace App\Services;

use App\Models\{Person, SocialActivity};
use Illuminate\Support\Facades\{Http, Log};

class MessageDrafter
{
    public function draft(Person $person, string $context, ?SocialActivity $signal = null): string
    {
        // Respect "do not contact" — never generate outreach drafts for these.
        if ($person->do_not_contact) {
            throw new \RuntimeException(
                $person->do_not_contact_reason
                    ? "This contact is marked do-not-contact: {$person->do_not_contact_reason}"
                    : 'This contact is marked do-not-contact.'
            );
        }

        $scraperUrl = rtrim((string) config('services.scraper.url', ''), '/');
        if ($scraperUrl === '') {
            return $this->fallback($person, $context);
        }

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['X-Api-Key'] = $key;
        }

        $payload = [
            'person_summary' => $this->buildPersonSummary($person),
            'signal'         => $signal ? [
                'source'      => $signal->source,
                'kind'        => $signal->kind,
                'content'     => $signal->content,
                'occurred_at' => $signal->occurred_at?->toIso8601String(),
                'location'    => $signal->location,
            ] : null,
            'reason'         => $context,
            'user_voice_hint' => null,
        ];

        try {
            $response = Http::timeout(30)
                ->withHeaders($headers)
                ->post("{$scraperUrl}/api/draft-message", $payload);

            if ($response->failed()) {
                Log::warning('Draft-message proxy non-2xx', [
                    'status' => $response->status(),
                ]);
                return $this->fallback($person, $context);
            }

            $body = $response->json();
            $draft = $body['draft'] ?? $body['message'] ?? null;
            if (is_string($draft) && trim($draft) !== '') {
                return $draft;
            }
        } catch (\Throwable $e) {
            Log::warning('Draft-message proxy threw', ['err' => $e->getMessage()]);
        }

        return $this->fallback($person, $context);
    }

    private function buildPersonSummary(Person $person): array
    {
        $recentDiscussions = $person->discussions()
            ->orderByDesc('date')
            ->limit(3)
            ->get(['discussions.id', 'discussions.title', 'discussions.date', 'discussions.summary'])
            ->map(fn ($d) => [
                'title'   => $d->title,
                'date'    => optional($d->date)->toDateString(),
                'summary' => $d->summary,
            ])->all();

        $recentNotes = $person->notes()
            ->orderByDesc('created_at')
            ->limit(3)
            ->get(['id', 'body', 'created_at'])
            ->map(fn ($n) => [
                'body'    => \Illuminate\Support\Str::limit((string) ($n->body ?? ''), 300),
                'created' => $n->created_at?->toIso8601String(),
            ])->all();

        $recentActivity = $person->activity()->limit(2)->get()->map(fn ($a) => [
            'source'      => $a->source,
            'kind'        => $a->kind,
            'content'     => $a->content,
            'occurred_at' => $a->occurred_at?->toIso8601String(),
        ])->all();

        return [
            'id'                    => $person->id,
            'first_name'            => $person->first_name,
            'last_name'             => $person->last_name,
            'nickname'              => $person->nickname,
            'title'                 => $person->title,
            'company'               => $person->company?->name,
            'relationship_strength' => $person->relationship_strength,
            'last_contacted_at'     => $person->last_contacted_at?->toIso8601String(),
            'how_we_met'            => $person->how_we_met,
            'recent_discussions'    => $recentDiscussions,
            'recent_notes'          => $recentNotes,
            'recent_activity'       => $recentActivity,
        ];
    }

    private function fallback(Person $person, string $context): string
    {
        $first = $person->nickname ?: $person->first_name ?: 'there';
        return match (true) {
            str_contains($context, 'birthday')   => "Happy birthday, {$first}! Hope you're well.",
            str_contains($context, 'job_change') => "Hey {$first} — saw the new role. Congrats!",
            str_contains($context, 'cadence')    => "Hey {$first} — it's been a while. How have you been?",
            default                              => "Hey {$first} — thinking of you. How's everything?",
        };
    }
}
