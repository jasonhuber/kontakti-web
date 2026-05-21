<?php

namespace Database\Seeders;

use App\Models\{Company, Person, Deal, Discussion, Note, Task, Tag, User};
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Create the single owner user
        User::firstOrCreate(
            ['email' => 'you@example.com'],
            [
                'name'     => 'Jason Huber',
                'email'    => 'you@example.com',
                'password' => Hash::make('changeme'),
            ]
        );

        // Seed tags
        $tagData = [
            ['name' => 'investor',  'color' => '#6366f1'],
            ['name' => 'advisor',   'color' => '#8b5cf6'],
            ['name' => 'partner',   'color' => '#06b6d4'],
            ['name' => 'customer',  'color' => '#10b981'],
            ['name' => 'recruiting','color' => '#f59e0b'],
            ['name' => 'vip',       'color' => '#ef4444'],
        ];

        foreach ($tagData as $t) {
            Tag::firstOrCreate(['slug' => \Illuminate\Support\Str::slug($t['name'])], $t);
        }

        // Example company
        $company = Company::firstOrCreate(['name' => 'Acme Corp'], [
            'domain'   => 'acme.com',
            'industry' => 'SaaS',
            'website'  => 'https://acme.com',
        ]);

        // Example person
        $person = Person::firstOrCreate(['email' => 'john@acme.com'], [
            'first_name'            => 'John',
            'last_name'             => 'Smith',
            'title'                 => 'VP of Engineering',
            'company_id'            => $company->id,
            'relationship_strength' => 'warm',
            'linkedin_url'          => 'https://linkedin.com/in/johnsmith',
        ]);

        // Example deal
        $deal = Deal::firstOrCreate(['title' => 'Acme Corp — Series A Intro'], [
            'stage'      => 'qualified',
            'company_id' => $company->id,
            'value'      => 250000,
            'currency'   => 'USD',
        ]);

        // Link person to deal
        $deal->contacts()->syncWithoutDetaching([
            $person->id => ['role' => 'champion'],
        ]);

        // Example discussion
        $discussion = Discussion::firstOrCreate(['title' => 'Intro call with John Smith'], [
            'date'    => now()->subDays(7),
            'type'    => 'call',
            'summary' => 'Initial call to discuss the opportunity. Strong interest.',
            'deal_id' => $deal->id,
        ]);

        $discussion->participants()->syncWithoutDetaching([$person->id]);

        // Example note
        Note::firstOrCreate(
            ['notable_type' => Person::class, 'notable_id' => $person->id, 'title' => 'First impressions'],
            ['body' => "Strong technical background. Decision maker for engineering tools.\nIntroduced by [[Sarah Chen]]."]
        );

        // Example task
        Task::firstOrCreate(['title' => 'Send intro deck to John Smith'], [
            'due_at'        => now()->addDays(3),
            'priority'      => 'high',
            'taskable_type' => Deal::class,
            'taskable_id'   => $deal->id,
        ]);

        $this->command->info('Seed complete. Login: you@example.com / changeme');
    }
}
