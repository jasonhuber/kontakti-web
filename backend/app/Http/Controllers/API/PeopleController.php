<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company, ActivityFeedItem};
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\Http;

class PeopleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = auth()->user()->people()
            ->with(['company', 'tags'])
            ->withCount(['discussions', 'deals', 'tasks' => fn($q) => $q->pending()]);

        if ($search = $request->get('q')) {
            $query->search($search);
        }

        if ($companyId = $request->get('company_id')) {
            $query->where('company_id', $companyId);
        }

        if ($strength = $request->get('relationship_strength')) {
            $query->where('relationship_strength', $strength);
        }

        if ($tag = $request->get('tag')) {
            $query->whereHas('tags', fn($q) => $q->where('slug', $tag));
        }

        if ($request->boolean('overdue')) {
            $query->overdue();
        }

        $people = $query->orderBy('last_name')->paginate(50);

        return response()->json($people);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name'            => 'required|string|max:100',
            'last_name'             => 'required|string|max:100',
            'email'                 => 'nullable|email|unique:people',
            'phone'                 => 'nullable|string|max:50',
            'linkedin_url'          => 'nullable|url|max:500',
            'company_id'            => 'nullable|uuid|exists:companies,id',
            'title'                 => 'nullable|string|max:200',
            'relationship_strength' => 'nullable|in:cold,warm,hot,close',
            'next_followup_at'      => 'nullable|date',
            'notes'                 => 'nullable|string',
            'metadata'              => 'nullable|array',
            'tags'                  => 'nullable|array',
        ]);

        $data['user_id'] = auth()->id();
        $person = Person::create($data);

        if (!empty($data['tags'])) {
            $this->syncTags($person, $data['tags']);
        }

        ActivityFeedItem::log('person', $person->id, 'created');

        return response()->json($person->load(['company', 'tags']), 201);
    }

    public function show(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->load(['company', 'tags', 'tasks' => fn($q) => $q->pending()->orderBy('due_at')])
        );
    }

    public function update(Request $request, Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $data = $request->validate([
            'first_name'            => 'sometimes|string|max:100',
            'last_name'             => 'sometimes|string|max:100',
            'email'                 => "sometimes|nullable|email|unique:people,email,{$person->id}",
            'phone'                 => 'sometimes|nullable|string|max:50',
            'linkedin_url'          => 'sometimes|nullable|url|max:500',
            'company_id'            => 'sometimes|nullable|uuid|exists:companies,id',
            'title'                 => 'sometimes|nullable|string|max:200',
            'relationship_strength' => 'sometimes|in:cold,warm,hot,close',
            'last_contacted_at'     => 'sometimes|nullable|date',
            'next_followup_at'      => 'sometimes|nullable|date',
            'notes'                 => 'sometimes|nullable|string',
            'metadata'              => 'sometimes|nullable|array',
            'tags'                  => 'sometimes|nullable|array',
        ]);

        $person->update($data);

        if (array_key_exists('tags', $data)) {
            $this->syncTags($person, $data['tags'] ?? []);
        }

        ActivityFeedItem::log('person', $person->id, 'updated');

        return response()->json($person->load(['company', 'tags']));
    }

    public function destroy(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $person->delete();
        return response()->json(null, 204);
    }

    public function timeline(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $discussions = $person->discussions()
            ->with('deal')
            ->orderByDesc('date')
            ->get()
            ->map(fn($d) => ['type' => 'discussion', 'date' => $d->date, 'data' => $d]);

        $notes = $person->notes()
            ->orderByDesc('created_at')
            ->get()
            ->map(fn($n) => ['type' => 'note', 'date' => $n->created_at, 'data' => $n]);

        $tasks = $person->tasks()
            ->whereNotNull('completed_at')
            ->orderByDesc('completed_at')
            ->get()
            ->map(fn($t) => ['type' => 'task', 'date' => $t->completed_at, 'data' => $t]);

        $timeline = $discussions
            ->merge($notes)
            ->merge($tasks)
            ->sortByDesc('date')
            ->values();

        return response()->json($timeline);
    }

    public function discussions(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->discussions()->with(['participants', 'deal'])->orderByDesc('date')->get()
        );
    }

    public function deals(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->deals()->with('company')->orderByDesc('created_at')->get()
        );
    }

    public function notes(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->notes()->orderByDesc('created_at')->get()
        );
    }

    public function tasks(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        return response()->json(
            $person->tasks()->orderBy('due_at')->get()
        );
    }

    public function enrich(Request $request): JsonResponse
    {
        $data = $request->validate([
            'linkedin_url' => 'required|url|max:500',
        ]);

        $apiKey = env('PROXYCURL_API_KEY');

        $response = Http::withHeaders([
            'Authorization' => "Bearer {$apiKey}",
        ])->get('https://nubela.co/proxycurl/api/v2/linkedin', [
            'url'       => $data['linkedin_url'],
            'use_cache' => 'if-present',
        ]);

        if ($response->failed()) {
            return response()->json([
                'message' => 'Proxycurl lookup failed: ' . $response->status(),
            ], 502);
        }

        $p = $response->json();

        // Resolve or create company from first experience entry
        $companyId = null;
        $companyName = $p['experiences'][0]['company'] ?? null;
        if ($companyName) {
            $company = Company::firstOrCreate(
                ['user_id' => auth()->id(), 'name' => $companyName],
                ['user_id' => auth()->id(), 'name' => $companyName]
            );
            $companyId = $company->id;
        }

        // Build linkedin_url from public_identifier if not already a full URL
        $linkedinUrl = $data['linkedin_url'];
        if (empty($linkedinUrl) && !empty($p['public_identifier'])) {
            $linkedinUrl = "https://www.linkedin.com/in/{$p['public_identifier']}";
        }

        $person = Person::create([
            'user_id'               => auth()->id(),
            'first_name'            => $p['first_name'] ?? 'Unknown',
            'last_name'             => $p['last_name'] ?? '',
            'title'                 => $p['headline'] ?? null,
            'avatar_url'            => $p['profile_pic_url'] ?? null,
            'linkedin_url'          => $linkedinUrl,
            'company_id'            => $companyId,
            'notes'                 => $p['summary'] ?? null,
            'relationship_strength' => 'cold',
        ]);

        return response()->json($person->load(['company', 'tags']), 201);
    }

    private function syncTags(Person $person, array $tagNames): void
    {
        $tagIds = collect($tagNames)->map(function (string $name) {
            return \App\Models\Tag::firstOrCreate(
                ['user_id' => auth()->id(), 'slug' => \Illuminate\Support\Str::slug($name)],
                ['user_id' => auth()->id(), 'name' => $name, 'slug' => \Illuminate\Support\Str::slug($name)]
            )->id;
        });

        \DB::table('taggables')
            ->where('taggable_type', Person::class)
            ->where('taggable_id', $person->id)
            ->delete();

        $inserts = $tagIds->map(fn($id) => [
            'tag_id'        => $id,
            'taggable_type' => Person::class,
            'taggable_id'   => $person->id,
        ])->toArray();

        if (!empty($inserts)) {
            \DB::table('taggables')->insert($inserts);
        }
    }
}
