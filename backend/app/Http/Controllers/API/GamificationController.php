<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Services\GamificationService;
use Illuminate\Http\JsonResponse;

/**
 * "How am I doing at staying in touch and curating my contacts?" — a single
 * read-only dashboard payload (fitness score, weekly goal, streak, XP/level,
 * achievements, encouragement). All computation is scoped to auth()->user().
 */
class GamificationController extends Controller
{
    public function dashboard(GamificationService $game): JsonResponse
    {
        return response()->json($game->dashboardFor(auth()->user()));
    }
}
