<?php

namespace App\Services;

use App\Models\{ContactPrompt, Person, Tag, User};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\{Http, Log, DB};
use Illuminate\Support\Str;

/**
 * The 5-a-day contact quiz: surface the user's sparsest contacts and ask
 * one well-targeted question per person so we can gradually enrich profiles
 * without ever facing a blank form.
 */
class ContactQuizService
{
    public const DAILY_LIMIT = 5;

    /**
     * Map of question_key → templated text + suggested response chips.
     * Used both for generation and for the API response.
     */
    public const QUESTIONS = [
        'recognize' => [
            'template'  => 'Do you remember {name}?',
            'responses' => ['Yes — I know them', 'Vaguely', "No — don't remember"],
        ],
        'how_we_met' => [
            'template'  => 'How did you meet {name}?',
            'responses' => ['Work', 'Mutual friend', 'Event/conference', 'School', 'Online', 'Family', 'Other'],
        ],
        'relationship_type' => [
            'template'  => 'How would you describe your relationship with {name}?',
            'responses' => ['Work', 'Friend', 'Family', 'Weak tie', 'Lost touch'],
        ],
        'last_recall' => [
            'template'  => 'When did you last talk to {name}?',
            'responses' => ['This month', 'Last few months', 'This year', 'Years ago', "Can't remember"],
        ],
        'notable' => [
            'template'  => 'Anything memorable about {name}?',
            'responses' => [], // free-form
        ],
    ];

    /**
     * Build (or return today's existing) quiz for the user.
     */
    public function generateDailyQuiz(User $user, int $limit = self::DAILY_LIMIT): Collection
    {
        // Idempotent for the calendar day.
        $existing = ContactPrompt::where('user_id', $user->id)
            ->whereDate('shown_at', now()->toDateString())
            ->with('person')
            ->get();
        if ($existing->isNotEmpty()) {
            return $existing;
        }

        $candidates = $this->selectCandidates($user, $limit);

        $prompts = collect();
        foreach ($candidates as $person) {
            $key = $this->chooseQuestionKey($person);
            $text = $this->buildQuestionText($person, $key);
            $prompt = ContactPrompt::create([
                'user_id'       => $user->id,
                'person_id'     => $person->id,
                'question_key'  => $key,
                'question_text' => $text,
                'shown_at'      => now(),
            ]);
            $prompt->setRelation('person', $person);
            $prompts->push($prompt);
        }
        return $prompts;
    }

    /**
     * Apply a user's answer to the underlying Person record.
     *
     * `$note` is an optional free-text note the user jots while reviewing. It's
     * saved as a first-class Note record on the person (not the legacy `notes`
     * string column) so it surfaces in MessageDrafter's `recent_notes` and the
     * AI can use it to decide how/why to reach out.
     */
    public function answer(ContactPrompt $prompt, string $answer, ?array $structured = null, ?string $note = null): void
    {
        DB::transaction(function () use ($prompt, $answer, $structured, $note) {
            $prompt->forceFill([
                'answered_at'       => now(),
                'answer'            => $answer,
                'answer_structured' => $structured,
            ])->save();

            $person = $prompt->person;
            if (!$person) return;

            $note = $note !== null ? trim($note) : '';
            if ($note !== '') {
                $person->notes()->create([
                    'user_id'  => $prompt->user_id,
                    'body'     => $note,
                    'metadata' => ['source' => 'quiz', 'question_key' => $prompt->question_key],
                ]);
            }

            switch ($prompt->question_key) {
                case 'recognize':
                    $normalized = strtolower(trim($structured['choice'] ?? $answer));
                    if (str_contains($normalized, 'no') || str_contains($normalized, "don't")) {
                        $meta = $person->metadata ?? [];
                        $meta['recognize'] = 'no';
                        $person->forceFill(['metadata' => $meta])->save();
                        $this->attachTag($person, 'forgotten');
                    } elseif (str_contains($normalized, 'vague')) {
                        $meta = $person->metadata ?? [];
                        $meta['recognize'] = 'vague';
                        $person->forceFill(['metadata' => $meta])->save();
                    } else {
                        $meta = $person->metadata ?? [];
                        $meta['recognize'] = 'yes';
                        $person->forceFill(['metadata' => $meta])->save();
                    }
                    break;

                case 'how_we_met':
                    if (empty($person->how_we_met)) {
                        $person->forceFill(['how_we_met' => trim($answer)])->save();
                    }
                    break;

                case 'relationship_type':
                    $choice = strtolower(trim($structured['choice'] ?? $answer));
                    $tag = match (true) {
                        str_contains($choice, 'work')   => 'work',
                        str_contains($choice, 'friend') => 'friend',
                        str_contains($choice, 'family') => 'family',
                        str_contains($choice, 'weak')   => 'weak-tie',
                        str_contains($choice, 'lost')   => 'lost-touch',
                        default                         => Str::slug($choice) ?: 'connection',
                    };
                    $this->attachTag($person, $tag);
                    break;

                case 'last_recall':
                    $date = $structured['date'] ?? null;
                    $parsed = null;
                    if ($date) {
                        try { $parsed = \Carbon\Carbon::parse($date); } catch (\Throwable) {}
                    } else {
                        // Vague-time heuristic.
                        $lower = strtolower($answer);
                        $parsed = match (true) {
                            str_contains($lower, 'this month')       => now()->subWeeks(2),
                            str_contains($lower, 'last few months')  => now()->subMonths(2),
                            str_contains($lower, 'this year')        => now()->subMonths(6),
                            str_contains($lower, 'years ago')        => now()->subYears(2),
                            default                                  => null,
                        };
                    }
                    if ($parsed && (!$person->last_contacted_at || $parsed->gt($person->last_contacted_at))) {
                        $person->forceFill(['last_contacted_at' => $parsed])->save();
                    }
                    break;

                case 'notable':
                    $stamp = now()->toDateString();
                    $line  = "From quiz {$stamp}: " . trim($answer);
                    $existing = trim((string) $person->notes);
                    $merged = $existing === '' ? $line : ($existing . "\n\n" . $line);
                    $person->forceFill(['notes' => $merged])->save();
                    break;
            }
        });
    }

    /**
     * Mark the prompt skipped — same person won't be re-asked for 30 days.
     */
    public function skip(ContactPrompt $prompt): void
    {
        $prompt->forceFill(['skipped_at' => now()])->save();
    }

    /**
     * Build the question text. Tries the enrichment proxy for a smarter
     * variant; falls back to the static template on any failure.
     */
    public function buildQuestionText(Person $person, string $questionKey): string
    {
        $template = self::QUESTIONS[$questionKey]['template'] ?? 'Tell me about {name}.';
        $fallback = str_replace('{name}', $person->full_name, $template);

        $scraperUrl = rtrim((string) config('services.scraper.url', ''), '/');
        if ($scraperUrl === '') {
            return $fallback;
        }

        try {
            $headers = [];
            if ($key = config('services.scraper.key')) {
                $headers['X-Api-Key'] = $key;
            }
            $resp = Http::timeout(5)->withHeaders($headers)->post("{$scraperUrl}/api/quiz-question", [
                'question_key' => $questionKey,
                'person'       => [
                    'name'          => $person->full_name,
                    'company'       => $person->company?->name,
                    'title'         => $person->title,
                    'tags'          => $person->tags()->pluck('name')->all(),
                    'how_we_met'    => $person->how_we_met,
                    'social_handles'=> array_filter([
                        'instagram' => $person->instagram_handle,
                        'twitter'   => $person->twitter_x_handle,
                        'linkedin'  => $person->linkedin_url,
                    ]),
                ],
            ]);
            if ($resp->successful()) {
                $text = $resp->json('question') ?? $resp->json('text');
                if (is_string($text) && trim($text) !== '') return $text;
            }
        } catch (\Throwable $e) {
            Log::info('Quiz question proxy failed', ['err' => $e->getMessage()]);
        }
        return $fallback;
    }

    // ─────────────────────────────────────────────────────────────────

    /**
     * Score people on data sparseness and return the top N for today's quiz.
     */
    public function selectCandidates(User $user, int $limit): Collection
    {
        $cutoffRecent = now()->subDays(7);
        $cutoffPrompted = now()->subDays(14);

        $recentlyPromptedIds = ContactPrompt::where('user_id', $user->id)
            ->where('shown_at', '>=', $cutoffPrompted)
            ->pluck('person_id')
            ->all();

        $skipForeverIds = ContactPrompt::where('user_id', $user->id)
            ->where('question_key', 'recognize')
            ->whereNotNull('answered_at')
            ->where(function ($q) {
                $q->where('answer', 'like', '%No %')
                  ->orWhere('answer', 'like', "%don't%")
                  ->orWhereJsonContains('answer_structured->choice', "No — don't remember");
            })
            ->pluck('person_id')
            ->all();

        $skip30dIds = ContactPrompt::where('user_id', $user->id)
            ->whereNotNull('skipped_at')
            ->where('skipped_at', '>=', now()->subDays(30))
            ->pluck('person_id')
            ->all();

        $blocked = array_unique(array_merge($recentlyPromptedIds, $skipForeverIds, $skip30dIds));

        $people = $user->people()
            ->with(['tags:id,name'])
            ->withCount('discussions')
            ->whereNotIn('id', $blocked ?: ['00000000-0000-0000-0000-000000000000'])
            ->get();

        $scored = $people->map(function (Person $p) use ($cutoffRecent) {
            $score = 0;
            if (empty(trim((string) $p->notes)) && empty(trim((string) $p->device_note))) $score += 2;
            if (empty($p->how_we_met)) $score += 2;
            if (($p->discussions_count ?? 0) === 0) $score += 2;
            if (empty($p->title) || empty($p->company_id)) $score += 1;
            if (empty($p->birthday)) $score += 1;
            if (empty($p->instagram_handle) && empty($p->twitter_x_handle)
                && empty($p->facebook_url) && empty($p->tiktok_handle)
                && empty($p->whatsapp_phone) && empty($p->linkedin_url)) $score += 1;
            if ($p->tags->isEmpty()) $score += 1;
            if (($p->relationship_strength ?? 'cold') === 'cold') $score += 2;
            if ($p->created_at && $p->created_at->gt($cutoffRecent)) $score -= 3;
            // -5 if already prompted in last 14d is enforced by exclusion above.
            return [$p, $score];
        });

        return $scored
            ->sortByDesc(fn ($pair) => $pair[1])
            ->take($limit)
            ->map(fn ($pair) => $pair[0])
            ->values();
    }

    private function chooseQuestionKey(Person $person): string
    {
        $recognize = $person->metadata['recognize'] ?? null;
        $isCold = ($person->relationship_strength ?? 'cold') === 'cold';
        $hasNotes = !empty(trim((string) $person->notes));
        $hasDiscussions = ($person->discussions_count ?? $person->discussions()->count()) > 0;

        // 1. If we have low confidence the user even recognizes them, ask first.
        if ($recognize === null && $isCold && !$hasNotes && !$hasDiscussions) {
            return 'recognize';
        }

        // 2. If they've confirmed recognition but how_we_met is empty.
        if (empty($person->how_we_met)) {
            return 'how_we_met';
        }

        // 3. If no relationship-type tag attached, ask that.
        $rel = ['work','friend','family','weak-tie','lost-touch'];
        $hasRelTag = $person->tags->contains(fn ($t) => in_array(strtolower($t->name), $rel, true));
        if (!$hasRelTag) {
            return 'relationship_type';
        }

        // 4. last_contacted_at unknown and no Discussions → ask when.
        if (!$person->last_contacted_at && !$hasDiscussions) {
            return 'last_recall';
        }

        // 5. Otherwise, fish for something memorable.
        return 'notable';
    }

    private function attachTag(Person $person, string $name): void
    {
        $slug = Str::slug($name);
        // tags table has a global unique(slug); look up by slug then create.
        $tag = Tag::where('slug', $slug)->first();
        if (!$tag) {
            $tag = Tag::create([
                'user_id' => $person->user_id, // column may not exist; harmless if fillable filters it
                'name'    => $name,
                'slug'    => $slug,
            ]);
        }
        $person->tags()->syncWithoutDetaching([$tag->id => ['taggable_type' => Person::class]]);
    }
}
