<?php

namespace App\Services;

use App\Models\{Person, Company, Discussion, Deal, Note};
use Illuminate\Support\Str;

class ObsidianExportService
{
    private string $vaultPath;
    private string $crmFolder;

    public function __construct()
    {
        $this->vaultPath = config('obsidian.vault_path');
        $this->crmFolder = config('obsidian.crm_folder');
    }

    public function exportAll(): array
    {
        $counts = [
            'people'      => 0,
            'companies'   => 0,
            'discussions' => 0,
            'deals'       => 0,
            'notes'       => 0,
        ];

        foreach (Person::with(['company', 'tags', 'discussions', 'deals'])->cursor() as $person) {
            $this->exportPerson($person);
            $counts['people']++;
        }

        foreach (Company::with(['people', 'deals', 'tags'])->cursor() as $company) {
            $this->exportCompany($company);
            $counts['companies']++;
        }

        foreach (Discussion::with(['participants', 'deal'])->cursor() as $discussion) {
            $this->exportDiscussion($discussion);
            $counts['discussions']++;
        }

        foreach (Deal::with(['company', 'contacts', 'tags'])->cursor() as $deal) {
            $this->exportDeal($deal);
            $counts['deals']++;
        }

        foreach (Note::whereNull('notable_type')->cursor() as $note) {
            $this->exportNote($note);
            $counts['notes']++;
        }

        return $counts;
    }

    public function exportPerson(Person $person): string
    {
        $slug = Str::slug("{$person->first_name}-{$person->last_name}");
        $path = $this->subpath("people/{$slug}.md");

        $discussions = $person->discussions->map(fn($d) => "- {$d->obsidian_link}")->join("\n");
        $deals = $person->deals->map(fn($d) => "- {$d->obsidian_link}")->join("\n");

        $content = $this->renderFrontmatter([
            'konataki_id'     => $person->id,
            'type'            => 'person',
            'company'         => $person->company?->obsidian_link,
            'title'           => $person->title,
            'email'           => $person->email,
            'linkedin'        => $person->linkedin_url,
            'relationship'    => $person->relationship_strength,
            'last_contacted'  => $person->last_contacted_at?->format('Y-m-d'),
            'next_followup'   => $person->next_followup_at?->format('Y-m-d'),
            'tags'            => $person->tags->pluck('name')->toArray(),
        ]);

        $content .= "\n# {$person->full_name}\n\n";

        if ($person->title || $person->company) {
            $content .= implode(' at ', array_filter([$person->title, $person->company?->obsidian_link])) . "\n\n";
        }

        if ($person->notes) {
            $content .= "## Notes\n\n" . $this->resolveEntityRefs($person->notes) . "\n\n";
        }

        if ($discussions) {
            $content .= "## Discussions\n\n{$discussions}\n\n";
        }

        if ($deals) {
            $content .= "## Deals\n\n{$deals}\n\n";
        }

        $this->writeFile($path, $content);

        $person->update(['obsidian_path' => $path, 'synced_at' => now()]);

        return $path;
    }

    public function exportCompany(Company $company): string
    {
        $slug = Str::slug($company->name);
        $path = $this->subpath("companies/{$slug}.md");

        $people = $company->people->map(fn($p) => "- {$p->obsidian_link} — {$p->title}")->join("\n");
        $deals  = $company->deals->map(fn($d) => "- {$d->obsidian_link} — {$d->stage}")->join("\n");

        $content = $this->renderFrontmatter([
            'konataki_id' => $company->id,
            'type'        => 'company',
            'domain'      => $company->domain,
            'industry'    => $company->industry,
            'size'        => $company->size_range,
            'linkedin'    => $company->linkedin_url,
            'website'     => $company->website,
            'tags'        => $company->tags->pluck('name')->toArray(),
        ]);

        $content .= "\n# {$company->name}\n\n";

        if ($people) {
            $content .= "## People\n\n{$people}\n\n";
        }

        if ($deals) {
            $content .= "## Deals\n\n{$deals}\n\n";
        }

        if ($company->notes) {
            $content .= "## Notes\n\n" . $this->resolveEntityRefs($company->notes) . "\n\n";
        }

        $this->writeFile($path, $content);

        return $path;
    }

    public function exportDiscussion(Discussion $discussion): string
    {
        $slug = Str::slug($discussion->obsidian_title);
        $path = $this->subpath("discussions/{$slug}.md");

        $participants = $discussion->participants
            ->map(fn($p) => $p->obsidian_link)
            ->join(', ');

        $content = $this->renderFrontmatter([
            'konataki_id'      => $discussion->id,
            'type'             => 'discussion',
            'date'             => $discussion->date->toISOString(),
            'discussion_type'  => $discussion->type,
            'participants'     => $discussion->participants->map(fn($p) => $p->obsidian_link)->toArray(),
            'deal'             => $discussion->deal?->obsidian_link,
        ]);

        $content .= "\n# {$discussion->obsidian_title}\n\n";

        if ($participants) {
            $content .= "**Participants:** {$participants}\n\n";
        }

        if ($discussion->summary) {
            $content .= "## Summary\n\n{$discussion->summary}\n\n";
        }

        if ($discussion->body) {
            $content .= $this->resolveEntityRefs($discussion->body) . "\n\n";
        }

        $this->writeFile($path, $content);

        $discussion->update(['synced_at' => now()]);

        return $path;
    }

    public function exportDeal(Deal $deal): string
    {
        $slug = Str::slug($deal->title);
        $path = $this->subpath("deals/{$slug}.md");

        $contacts = $deal->contacts
            ->map(fn($p) => "- {$p->obsidian_link} — {$p->pivot->role}")
            ->join("\n");

        $content = $this->renderFrontmatter([
            'konataki_id'   => $deal->id,
            'type'          => 'deal',
            'stage'         => $deal->stage,
            'value'         => $deal->value ? "{$deal->currency} {$deal->value}" : null,
            'company'       => $deal->company?->obsidian_link,
            'close_date'    => $deal->expected_close_date?->format('Y-m-d'),
            'tags'          => $deal->tags->pluck('name')->toArray(),
        ]);

        $content .= "\n# {$deal->title}\n\n";

        if ($contacts) {
            $content .= "## Contacts\n\n{$contacts}\n\n";
        }

        if ($deal->description) {
            $content .= "## Description\n\n" . $this->resolveEntityRefs($deal->description) . "\n\n";
        }

        $this->writeFile($path, $content);

        return $path;
    }

    public function exportNote(Note $note): string
    {
        $title = $note->title ?? 'note-' . substr($note->id, 0, 8);
        $slug  = Str::slug($title);
        $path  = $this->subpath("notes/{$slug}.md");

        $content = $this->renderFrontmatter([
            'konataki_id' => $note->id,
            'type'        => 'note',
            'title'       => $note->title,
        ]);

        if ($note->title) {
            $content .= "\n# {$note->title}\n\n";
        }

        $content .= $this->resolveEntityRefs($note->body) . "\n";

        $this->writeFile($path, $content);

        $note->update(['obsidian_path' => $path, 'synced_at' => now()]);

        return $path;
    }

    // — Private helpers —

    private function resolveEntityRefs(string $text): string
    {
        // Replace @person:uuid with [[Full Name]]
        $text = preg_replace_callback('/@person:([a-f0-9-]{36})/', function ($matches) {
            $person = Person::find($matches[1]);
            return $person ? $person->obsidian_link : $matches[0];
        }, $text);

        // Replace @company:uuid with [[Company Name]]
        $text = preg_replace_callback('/@company:([a-f0-9-]{36})/', function ($matches) {
            $company = Company::find($matches[1]);
            return $company ? $company->obsidian_link : $matches[0];
        }, $text);

        // Replace @deal:uuid with [[Deal Title]]
        $text = preg_replace_callback('/@deal:([a-f0-9-]{36})/', function ($matches) {
            $deal = Deal::find($matches[1]);
            return $deal ? $deal->obsidian_link : $matches[0];
        }, $text);

        return $text;
    }

    private function renderFrontmatter(array $fields): string
    {
        $lines = ["---"];
        foreach ($fields as $key => $value) {
            if ($value === null) continue;
            if (is_array($value)) {
                $lines[] = "{$key}: [" . implode(', ', array_map(fn($v) => "\"{$v}\"", $value)) . "]";
            } else {
                $escaped = str_contains((string)$value, ':') ? "\"{$value}\"" : $value;
                $lines[] = "{$key}: {$escaped}";
            }
        }
        $lines[] = "---";
        return implode("\n", $lines);
    }

    private function subpath(string $relative): string
    {
        return rtrim($this->vaultPath, '/') . '/' . trim($this->crmFolder, '/') . '/' . $relative;
    }

    private function writeFile(string $path, string $content): void
    {
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($path, $content);
    }
}
