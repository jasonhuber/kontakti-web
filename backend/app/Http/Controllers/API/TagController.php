<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Tag;
use Illuminate\Http\{Request, JsonResponse};

class TagController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Tag::orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'  => 'required|string|max:100|unique:tags',
            'color' => 'nullable|string|regex:/^#[0-9a-fA-F]{6}$/',
        ]);

        $tag = Tag::create($data);
        return response()->json($tag, 201);
    }

    public function destroy(Tag $tag): JsonResponse
    {
        \DB::table('taggables')->where('tag_id', $tag->id)->delete();
        $tag->delete();
        return response()->json(null, 204);
    }
}
