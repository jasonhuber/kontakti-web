<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Tag;
use Illuminate\Http\{Request, JsonResponse};

class TagController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Tag::where('user_id', auth()->id())->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'  => 'required|string|max:100|unique:tags',
            'color' => 'nullable|string|regex:/^#[0-9a-fA-F]{6}$/',
        ]);

        $data['user_id'] = auth()->id();
        $tag = Tag::create($data);
        return response()->json($tag, 201);
    }

    public function destroy(Tag $tag): JsonResponse
    {
        abort_if($tag->user_id !== auth()->id(), 403);

        \DB::table('taggables')->where('tag_id', $tag->id)->delete();
        $tag->delete();
        return response()->json(null, 204);
    }
}
