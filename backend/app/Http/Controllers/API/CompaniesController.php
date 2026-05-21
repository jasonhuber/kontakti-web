<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\{Request, JsonResponse};

class CompaniesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Company::withCount(['people', 'deals'])
            ->with('tags');

        if ($search = $request->get('q')) {
            $query->search($search);
        }

        if ($industry = $request->get('industry')) {
            $query->where('industry', $industry);
        }

        return response()->json($query->orderBy('name')->paginate(50));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'         => 'required|string|max:255',
            'domain'       => 'nullable|string|max:255|unique:companies',
            'logo_url'     => 'nullable|url|max:500',
            'industry'     => 'nullable|string|max:100',
            'size_range'   => 'nullable|string|max:50',
            'linkedin_url' => 'nullable|url|max:500',
            'website'      => 'nullable|url|max:500',
            'notes'        => 'nullable|string',
            'metadata'     => 'nullable|array',
        ]);

        $company = Company::create($data);
        return response()->json($company->load('tags'), 201);
    }

    public function show(Company $company): JsonResponse
    {
        return response()->json(
            $company->load(['tags', 'people' => fn($q) => $q->orderBy('last_name')])
                    ->loadCount(['people', 'deals'])
        );
    }

    public function update(Request $request, Company $company): JsonResponse
    {
        $data = $request->validate([
            'name'         => 'sometimes|string|max:255',
            'domain'       => "sometimes|nullable|string|unique:companies,domain,{$company->id}",
            'logo_url'     => 'sometimes|nullable|url|max:500',
            'industry'     => 'sometimes|nullable|string|max:100',
            'size_range'   => 'sometimes|nullable|string|max:50',
            'linkedin_url' => 'sometimes|nullable|url|max:500',
            'website'      => 'sometimes|nullable|url|max:500',
            'notes'        => 'sometimes|nullable|string',
            'metadata'     => 'sometimes|nullable|array',
        ]);

        $company->update($data);
        return response()->json($company->load('tags'));
    }

    public function destroy(Company $company): JsonResponse
    {
        $company->delete();
        return response()->json(null, 204);
    }

    public function people(Company $company): JsonResponse
    {
        return response()->json(
            $company->people()->with('tags')->orderBy('last_name')->get()
        );
    }

    public function deals(Company $company): JsonResponse
    {
        return response()->json(
            $company->deals()->with('contacts')->orderByDesc('created_at')->get()
        );
    }

    public function discussions(Company $company): JsonResponse
    {
        // Discussions involving any person at this company
        return response()->json(
            \App\Models\Discussion::whereHas('participants', fn($q) =>
                $q->where('company_id', $company->id)
            )->with(['participants', 'deal'])->orderByDesc('date')->get()
        );
    }
}
