<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company, Discussion, Deal, Note};
use Illuminate\Http\{Request, JsonResponse};

class SearchController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $term = $request->validate(['q' => 'required|string|min:2'])['q'];

        $results = [];

        $people = Person::search($term)
            ->with('company')
            ->limit(5)
            ->get()
            ->map(fn($p) => [
                'type'     => 'person',
                'id'       => $p->id,
                'title'    => $p->full_name,
                'subtitle' => implode(' · ', array_filter([$p->title, $p->company?->name])),
                'url'      => "/people/{$p->id}",
            ]);

        $companies = Company::search($term)
            ->limit(5)
            ->get()
            ->map(fn($c) => [
                'type'     => 'company',
                'id'       => $c->id,
                'title'    => $c->name,
                'subtitle' => implode(' · ', array_filter([$c->industry, $c->domain])),
                'url'      => "/companies/{$c->id}",
            ]);

        $deals = Deal::search($term)
            ->with('company')
            ->limit(5)
            ->get()
            ->map(fn($d) => [
                'type'     => 'deal',
                'id'       => $d->id,
                'title'    => $d->title,
                'subtitle' => implode(' · ', array_filter([$d->stage, $d->company?->name])),
                'url'      => "/deals/{$d->id}",
            ]);

        $discussions = Discussion::search($term)
            ->limit(5)
            ->get()
            ->map(fn($d) => [
                'type'     => 'discussion',
                'id'       => $d->id,
                'title'    => $d->title,
                'subtitle' => $d->date->format('M j, Y'),
                'url'      => "/discussions/{$d->id}",
            ]);

        $notes = Note::search($term)
            ->limit(5)
            ->get()
            ->map(fn($n) => [
                'type'     => 'note',
                'id'       => $n->id,
                'title'    => $n->title ?? 'Untitled note',
                'subtitle' => substr(strip_tags($n->body), 0, 100),
                'url'      => "/notes/{$n->id}",
            ]);

        return response()->json([
            'query'   => $term,
            'results' => $people->merge($companies)->merge($deals)->merge($discussions)->merge($notes)->values(),
            'counts'  => [
                'people'      => $people->count(),
                'companies'   => $companies->count(),
                'deals'       => $deals->count(),
                'discussions' => $discussions->count(),
                'notes'       => $notes->count(),
            ],
        ]);
    }
}
