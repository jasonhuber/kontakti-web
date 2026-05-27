<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Services\JobChangeDetector;
use Illuminate\Http\JsonResponse;

class JobsController extends Controller
{
    public function __construct(private JobChangeDetector $detector) {}

    public function detectChanges(): JsonResponse
    {
        $result = $this->detector->detectForUser(auth()->user());
        return response()->json($result, 202);
    }
}
