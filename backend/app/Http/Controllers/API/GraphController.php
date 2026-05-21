<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company, Deal, EntityLink};
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\DB;

class GraphController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // Build nodes + edges in React Flow format
        $nodes = [];
        $edges = [];

        // People nodes
        Person::select('id', 'first_name', 'last_name', 'company_id', 'relationship_strength')
            ->with('company:id,name')
            ->get()
            ->each(function ($p) use (&$nodes) {
                $nodes[] = [
                    'id'   => $p->id,
                    'type' => 'person',
                    'data' => [
                        'label'    => $p->full_name,
                        'strength' => $p->relationship_strength,
                        'company'  => $p->company?->name,
                    ],
                ];
            });

        // Company nodes
        Company::select('id', 'name', 'industry')->get()->each(function ($c) use (&$nodes) {
            $nodes[] = [
                'id'   => $c->id,
                'type' => 'company',
                'data' => ['label' => $c->name, 'industry' => $c->industry],
            ];
        });

        // Deal nodes
        Deal::select('id', 'title', 'stage', 'company_id')->get()->each(function ($d) use (&$nodes) {
            $nodes[] = [
                'id'   => $d->id,
                'type' => 'deal',
                'data' => ['label' => $d->title, 'stage' => $d->stage],
            ];
        });

        // Edges: person → company
        Person::whereNotNull('company_id')->select('id', 'company_id')->get()
            ->each(function ($p) use (&$edges) {
                $edges[] = [
                    'id'     => "works-{$p->id}",
                    'source' => $p->id,
                    'target' => $p->company_id,
                    'label'  => 'works at',
                ];
            });

        // Edges: deal → company
        Deal::whereNotNull('company_id')->select('id', 'company_id')->get()
            ->each(function ($d) use (&$edges) {
                $edges[] = [
                    'id'     => "deal-co-{$d->id}",
                    'source' => $d->id,
                    'target' => $d->company_id,
                    'label'  => 'involves',
                ];
            });

        // Edges: entity_links
        EntityLink::all()->each(function ($link) use (&$edges) {
            $edges[] = [
                'id'     => $link->id,
                'source' => $link->source_id,
                'target' => $link->target_id,
                'label'  => $link->relationship_type,
            ];
        });

        return response()->json(['nodes' => $nodes, 'edges' => $edges]);
    }

    public function createLink(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source_type'       => 'required|string',
            'source_id'         => 'required|uuid',
            'target_type'       => 'required|string',
            'target_id'         => 'required|uuid',
            'relationship_type' => 'nullable|string|max:100',
            'notes'             => 'nullable|string',
        ]);

        $link = EntityLink::create($data);
        return response()->json($link, 201);
    }

    public function deleteLink(EntityLink $link): JsonResponse
    {
        $link->delete();
        return response()->json(null, 204);
    }
}
