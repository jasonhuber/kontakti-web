<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ContactPrompt;
use App\Services\ContactQuizService;
use Illuminate\Http\{JsonResponse, Request};

class QuizController extends Controller
{
    public function __construct(private ContactQuizService $quiz) {}

    public function today(Request $request): JsonResponse
    {
        $prompts = $this->quiz->generateDailyQuiz(auth()->user());

        return response()->json([
            'prompts' => $prompts->map(fn (ContactPrompt $p) => $this->serialize($p))->values(),
        ]);
    }

    public function answer(Request $request, ContactPrompt $prompt): JsonResponse
    {
        abort_if($prompt->user_id !== auth()->id(), 403);

        $data = $request->validate([
            'answer'     => 'required|string|max:4000',
            'structured' => 'nullable|array',
        ]);

        $this->quiz->answer($prompt, $data['answer'], $data['structured'] ?? null);

        return response()->json([
            'prompt' => $this->serialize($prompt->fresh(['person'])),
            'person' => $prompt->person?->fresh(),
        ]);
    }

    public function skip(Request $request, ContactPrompt $prompt): JsonResponse
    {
        abort_if($prompt->user_id !== auth()->id(), 403);
        $this->quiz->skip($prompt);
        return response()->json(['ok' => true]);
    }

    public function history(Request $request): JsonResponse
    {
        $limit    = max(1, min(100, (int) $request->query('limit', 30)));
        $personId = $request->query('person_id');

        $rows = ContactPrompt::where('user_id', auth()->id())
            ->whereNotNull('answered_at')
            ->when($personId, fn ($q) => $q->where('person_id', $personId))
            ->with('person')
            ->orderByDesc('answered_at')
            ->limit($limit)
            ->get();

        return response()->json([
            'prompts' => $rows->map(fn ($p) => $this->serialize($p))->values(),
        ]);
    }

    private function serialize(ContactPrompt $prompt): array
    {
        $suggestions = ContactQuizService::QUESTIONS[$prompt->question_key]['responses'] ?? [];
        return [
            'id'                  => $prompt->id,
            'person'              => $prompt->person,
            'question_key'        => $prompt->question_key,
            'question_text'       => $prompt->question_text,
            'suggested_responses' => $suggestions,
            'shown_at'            => $prompt->shown_at?->toIso8601String(),
            'answered_at'         => $prompt->answered_at?->toIso8601String(),
            'skipped_at'          => $prompt->skipped_at?->toIso8601String(),
            'answer'              => $prompt->answer,
            'answer_structured'   => $prompt->answer_structured,
        ];
    }
}
