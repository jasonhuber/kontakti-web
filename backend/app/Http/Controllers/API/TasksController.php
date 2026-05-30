<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Task, ActivityFeedItem};
use Illuminate\Http\{Request, JsonResponse};

class TasksController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::where('user_id', auth()->id())
            ->with('taskable')
            ->orderBy('due_at');

        if ($request->boolean('pending')) {
            $query->pending();
        }

        if ($request->boolean('overdue')) {
            $query->overdue();
        }

        // ?completed=true  → only completed tasks
        // ?completed=false → only pending tasks
        if ($request->has('completed')) {
            if ($request->boolean('completed')) {
                $query->whereNotNull('completed_at');
            } else {
                $query->whereNull('completed_at');
            }
        }

        if ($taskableType = $request->get('taskable_type')) {
            $query->where('taskable_type', $taskableType)
                  ->where('taskable_id', $request->get('taskable_id'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'         => 'required|string|max:255',
            'description'   => 'nullable|string',
            'due_at'        => 'nullable|date',
            'taskable_type' => 'nullable|string|max:100',
            'taskable_id'   => 'nullable|uuid',
            'priority'      => 'nullable|in:low,medium,high,urgent',
        ]);

        $data['user_id'] = auth()->id();
        $task = Task::create($data);
        return response()->json($task, 201);
    }

    public function show(Task $task): JsonResponse
    {
        abort_if($task->user_id !== auth()->id(), 403);

        return response()->json($task);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        abort_if($task->user_id !== auth()->id(), 403);

        $data = $request->validate([
            'title'       => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string',
            'due_at'      => 'sometimes|nullable|date',
            'priority'    => 'sometimes|in:low,medium,high,urgent',
        ]);

        $task->update($data);
        return response()->json($task);
    }

    public function destroy(Task $task): JsonResponse
    {
        abort_if($task->user_id !== auth()->id(), 403);

        $task->delete();
        return response()->json(null, 204);
    }

    public function complete(Task $task): JsonResponse
    {
        abort_if($task->user_id !== auth()->id(), 403);

        $task->complete();

        if ($task->taskable_id) {
            ActivityFeedItem::log(
                $task->taskable_type ?? 'task',
                $task->taskable_id ?? $task->id,
                'task_completed',
                null, null,
                ['task_title' => $task->title]
            );
        }

        return response()->json($task);
    }

    public function reopen(Task $task): JsonResponse
    {
        abort_if($task->user_id !== auth()->id(), 403);

        $task->reopen();
        return response()->json($task);
    }
}
