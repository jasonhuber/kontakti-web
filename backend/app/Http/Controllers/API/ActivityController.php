<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ActivityFeedItem;
use Illuminate\Http\{Request, JsonResponse};

class ActivityController extends Controller
{
    public function feed(Request $request): JsonResponse
    {
        $query = ActivityFeedItem::orderByDesc('created_at');

        if ($subjectType = $request->get('subject_type')) {
            $query->where('subject_type', $subjectType);
        }

        if ($subjectId = $request->get('subject_id')) {
            $query->where('subject_id', $subjectId);
        }

        return response()->json($query->limit(100)->get());
    }
}
