<?php

namespace App\Services;

use App\Models\{Company, Person, SocialActivity, User};
use Illuminate\Support\Facades\{Http, Log};

class JobChangeDetector
{
    public const MAX_PEOPLE_PER_INVOCATION = 30;
    public const STALE_AFTER_DAYS = 90;

    public function detectForUser(User $user): array
    {
        $scraperUrl = rtrim((string) config('services.scraper.url', ''), '/');
        if ($scraperUrl === '') {
            return ['detected' => 0, 'errors' => 0, 'skipped' => 0, 'reason' => 'scraper_not_configured'];
        }

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['X-Api-Key'] = $key;
        }

        $staleCutoff = now()->subDays(self::STALE_AFTER_DAYS);

        $people = $user->people()
            ->whereNotNull('linkedin_url')
            ->where(function ($q) use ($staleCutoff) {
                $q->whereNull('linkedin_last_scraped_at')
                  ->orWhere('linkedin_last_scraped_at', '<', $staleCutoff);
            })
            ->limit(self::MAX_PEOPLE_PER_INVOCATION)
            ->get();

        $detected = 0;
        $errors = 0;

        foreach ($people as $person) {
            try {
                $response = Http::timeout(45)
                    ->withHeaders($headers)
                    ->post("{$scraperUrl}/api/enrich-linkedin", [
                        'url'            => $person->linkedin_url,
                        'prior_snapshot' => $person->linkedin_snapshot,
                    ]);

                if ($response->failed()) {
                    $errors++;
                    Log::warning('LinkedIn enrich failed', [
                        'person_id' => $person->id,
                        'status'    => $response->status(),
                    ]);
                    continue;
                }

                $data = $response->json();
                $changed = (bool) ($data['changed'] ?? false);
                $snapshot = $data['snapshot'] ?? null;
                $newCompany = $data['company'] ?? null;
                $newTitle = $data['title'] ?? null;
                $summary = $data['change_summary'] ?? null;

                if ($changed) {
                    $priorCompanyName = $person->company?->name;
                    $priorTitle = $person->title;

                    // Record the SocialActivity job_change row
                    SocialActivity::create([
                        'person_id'   => $person->id,
                        'user_id'     => $user->id,
                        'source'      => 'linkedin',
                        'kind'        => 'job_change',
                        'occurred_at' => now(),
                        'content'     => $summary ?: trim(
                            ($priorCompanyName ? "Left {$priorCompanyName}" : 'Job change') .
                            ($newCompany ? " — now at {$newCompany}" : '') .
                            ($newTitle ? " as {$newTitle}" : '')
                        ),
                        'metadata' => [
                            'prior'   => array_filter([
                                'company' => $priorCompanyName,
                                'title'   => $priorTitle,
                            ]),
                            'current' => array_filter([
                                'company' => $newCompany,
                                'title'   => $newTitle,
                            ]),
                        ],
                    ]);

                    // Push the prior company onto previous_employers
                    if ($priorCompanyName) {
                        $prev = $person->previous_employers ?? [];
                        $prev[] = [
                            'company' => $priorCompanyName,
                            'title'   => $priorTitle,
                            'until'   => now()->toDateString(),
                        ];
                        $person->previous_employers = $prev;
                    }

                    // Resolve/create the new company
                    if ($newCompany) {
                        $company = $user->companies()
                            ->where('name', $newCompany)
                            ->first()
                            ?? $user->companies()->create(['name' => $newCompany]);
                        $person->company_id = $company->id;
                    }

                    if ($newTitle) {
                        $person->title = $newTitle;
                    }

                    $detected++;
                }

                $person->linkedin_last_scraped_at = now();
                if ($snapshot !== null) {
                    $person->linkedin_snapshot = $snapshot;
                }
                $person->save();
            } catch (\Throwable $e) {
                $errors++;
                Log::warning('Job change detection threw', [
                    'person_id' => $person->id,
                    'err'       => $e->getMessage(),
                ]);
            }
        }

        return [
            'detected' => $detected,
            'errors'   => $errors,
            'checked'  => $people->count(),
        ];
    }
}
