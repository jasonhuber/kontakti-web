<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{AccountPlan, AccountPlanItem, ActivityFeedItem, Company, Person, Task};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\{Arr, Str};
use Illuminate\Validation\Rule;

class AccountPlansController extends Controller
{
    public function showForCompany(Company $company): JsonResponse
    {
        $this->authorizeCompany($company);

        $plan = AccountPlan::firstOrCreate(
            ['user_id' => auth()->id(), 'company_id' => $company->id],
            ['title' => "{$company->name} account plan", 'status' => 'draft']
        );

        return response()->json($this->loadPlan($plan));
    }

    public function update(Request $request, AccountPlan $accountPlan): JsonResponse
    {
        $this->authorizePlan($accountPlan);

        $data = $request->validate($this->planRules(partial: true));
        $accountPlan->update($data);
        ActivityFeedItem::log('account_plan', $accountPlan->id, 'updated');

        return response()->json($this->loadPlan($accountPlan));
    }

    public function storeItem(Request $request, AccountPlan $accountPlan): JsonResponse
    {
        $this->authorizePlan($accountPlan);

        $item = $accountPlan->items()->create($this->validatedItem($request, partial: false));
        ActivityFeedItem::log('account_plan_item', (string) $item->id, 'created');

        return response()->json($this->loadPlan($accountPlan), 201);
    }

    public function updateItem(Request $request, AccountPlanItem $item): JsonResponse
    {
        $this->authorizePlan($item->accountPlan);

        $item->update($this->validatedItem($request, partial: true));
        ActivityFeedItem::log('account_plan_item', (string) $item->id, 'updated');

        return response()->json($this->loadPlan($item->accountPlan));
    }

    public function destroyItem(AccountPlanItem $item): JsonResponse
    {
        $this->authorizePlan($item->accountPlan);

        $plan = $item->accountPlan;
        $item->delete();

        return response()->json($this->loadPlan($plan));
    }

    public function preview(Request $request, AccountPlan $accountPlan): JsonResponse
    {
        $this->authorizePlan($accountPlan);

        $data = $request->validate([
            'instruction' => 'required|string|min:2|max:4000',
            'ui_context' => 'sometimes|array|max:10',
            'ui_context.view' => 'sometimes|string|max:50',
            'ui_context.selected_tab' => 'sometimes|string|max:50',
            'ui_context.company_id' => 'sometimes|uuid',
            'ui_context.account_plan_id' => 'sometimes|uuid',
            'ui_context.visible_people_ids' => 'sometimes|array|max:100',
            'ui_context.visible_people_ids.*' => 'uuid',
        ]);

        return response()->json($this->buildPreview(
            $accountPlan,
            $data['instruction'],
            $data['ui_context'] ?? []
        ));
    }

    public function apply(Request $request, AccountPlan $accountPlan): JsonResponse
    {
        $this->authorizePlan($accountPlan);

        $data = $request->validate([
            'operations' => 'required|array|min:1|max:50',
            'operations.*.op' => 'required|string|in:update_plan,create_plan_item',
        ]);

        return DB::transaction(function () use ($data, $accountPlan) {
            $plan = AccountPlan::whereKey($accountPlan->id)->lockForUpdate()->firstOrFail();
            $this->authorizePlan($plan);

            $applied = [];
            $changed = false;
            foreach ($data['operations'] as $operation) {
                if ($operation['op'] === 'update_plan') {
                    $patch = validator($operation['patch'] ?? [], $this->planRules(partial: true))->validate();
                    if ($patch) {
                        $plan->update($patch);
                        $changed = true;
                        $applied[] = ['op' => 'update_plan', 'fields' => array_keys($patch)];
                    }
                    continue;
                }

                $itemData = validator($operation, $this->itemRules(partial: false))->validate();
                $this->assertReferencedRowsBelongToUser($itemData);
                $itemData['ai_generated'] = true;

                $operationKey = $itemData['operation_key'] ?? null;
                $item = $operationKey
                    ? $plan->items()->firstOrCreate(['operation_key' => $operationKey], $itemData)
                    : $plan->items()->create($itemData);
                $created = $item->wasRecentlyCreated;
                $changed = $changed || $created;

                if (!empty($operation['create_task']) && !$item->task_id) {
                    $task = Task::create([
                        'user_id' => auth()->id(),
                        'title' => $item->title,
                        'description' => $item->description,
                        'due_at' => $item->due_at,
                        'priority' => $item->priority,
                        'taskable_type' => $item->person_id ? Person::class : Company::class,
                        'taskable_id' => $item->person_id ?: $plan->company_id,
                    ]);
                    $item->update(['task_id' => $task->id]);
                    $changed = true;
                }

                $applied[] = [
                    'op' => 'create_plan_item',
                    'id' => $item->id,
                    'title' => $item->title,
                    'created' => $created,
                ];
            }

            if ($changed) {
                ActivityFeedItem::log('account_plan', $plan->id, 'ai_applied', null, null, [
                    'operation_count' => count($applied),
                ]);
            }

            return response()->json([
                'applied' => $applied,
                'plan' => $this->loadPlan($plan),
            ]);
        });
    }

    private function buildPreview(AccountPlan $plan, string $instruction, array $uiContext): array
    {
        $plan->loadMissing(['company.people', 'items']);
        $company = $plan->company;
        $people = $company->people;
        $lines = $this->instructionLines($instruction);

        if ($lines->count() === 1 && preg_match('/\b(?:five|5)\b/i', $instruction)) {
            $lines = collect($this->defaultFiveItems($plan));
        }

        $operations = [];
        if (!$plan->objective && preg_match('/(?:30[- ]day|account plan|plan)/i', $instruction)) {
            $operations[] = [
                'op' => 'update_plan',
                'patch' => [
                    'status' => 'active',
                    'objective' => "Move {$company->name} from relationship context to a concrete next conversation and timeline.",
                    'summary' => 'Starter plan drafted from the current company and stakeholder context in Kontakti.',
                ],
                'explanation' => 'Adds a starter objective because this account plan does not have one yet.',
            ];
        }

        foreach ($lines->take(12) as $line) {
            $person = $this->matchPerson($people, $line);
            $operations[] = [
                'op' => 'create_plan_item',
                'type' => $this->inferType($line),
                'title' => ucfirst(rtrim($line, '.')),
                'description' => null,
                'status' => 'todo',
                'priority' => $this->inferPriority($line),
                'due_at' => $this->inferDueDate($line),
                'person_id' => $person?->id,
                'task_id' => null,
                'source_type' => 'ai_command',
                'source_id' => $plan->id,
                'operation_key' => (string) Str::uuid(),
                'ai_generated' => true,
                'ai_confidence' => $person ? 78 : 62,
                'metadata' => [
                    'instruction' => Str::limit($instruction, 500, ''),
                    'ui_context' => Arr::only($uiContext, ['view', 'selected_tab']),
                    'matched_person_name' => $person?->full_name,
                ],
            ];
        }

        return [
            'summary' => 'Preview ' . count($operations) . ' proposed account-plan change' . (count($operations) === 1 ? '' : 's') . '.',
            'operations' => $operations,
            'health' => $this->planHealth($plan),
        ];
    }

    private function instructionLines(string $instruction): Collection
    {
        return collect(preg_split('/\R+/', $instruction))
            ->map(fn ($line) => trim((string) preg_replace('/^\s*(?:[-*]|\d+[.)])\s*/', '', $line)))
            ->filter()
            ->values();
    }

    private function defaultFiveItems(AccountPlan $plan): array
    {
        $company = $plan->company;

        return [
            "Clarify the main objective for {$company->name}",
            'Identify the champion and decision maker',
            'Confirm timeline, budget, and success criteria',
            'Log the next stakeholder conversation',
            'Create a follow-up milestone for the next 30 days',
        ];
    }

    private function planHealth(AccountPlan $plan): array
    {
        return [
            ['key' => 'objective', 'missing' => blank($plan->objective), 'label' => 'No objective'],
            ['key' => 'next_step', 'missing' => !$plan->items->contains(fn ($item) => $item->type === 'next_step' && $item->status === 'todo'), 'label' => 'No next step'],
            ['key' => 'risk', 'missing' => !$plan->items->contains(fn ($item) => $item->type === 'risk' && $item->status === 'todo'), 'label' => 'No risks captured'],
            ['key' => 'question', 'missing' => !$plan->items->contains(fn ($item) => $item->type === 'question' && $item->status === 'todo'), 'label' => 'No open questions'],
        ];
    }

    private function inferType(string $text): string
    {
        return match (true) {
            (bool) preg_match('/\b(risk|blocker|concern|problem)\b/i', $text) => 'risk',
            (bool) preg_match('/\?|\b(question|ask|clarify|confirm)\b/i', $text) => 'question',
            (bool) preg_match('/\b(milestone|deadline|launch|timeline|date)\b/i', $text) => 'milestone',
            (bool) preg_match('/\b(stakeholder|champion|buyer|decision maker)\b/i', $text) => 'stakeholder_action',
            default => 'next_step',
        };
    }

    private function inferPriority(string $text): string
    {
        return match (true) {
            (bool) preg_match('/\b(urgent|asap|today|critical|blocker)\b/i', $text) => 'urgent',
            (bool) preg_match('/\b(high|important|decision maker|budget|timeline)\b/i', $text) => 'high',
            (bool) preg_match('/\b(low|someday|later)\b/i', $text) => 'low',
            default => 'medium',
        };
    }

    private function inferDueDate(string $text): ?string
    {
        return match (true) {
            (bool) preg_match('/\btoday\b/i', $text) => now()->toDateString(),
            (bool) preg_match('/\btomorrow\b/i', $text) => now()->addDay()->toDateString(),
            (bool) preg_match('/\bnext week\b/i', $text) => now()->addWeek()->toDateString(),
            (bool) preg_match('/\b30 days?\b/i', $text) => now()->addDays(30)->toDateString(),
            (bool) preg_match('/\bnext month\b/i', $text) => now()->addMonth()->toDateString(),
            default => null,
        };
    }

    private function matchPerson(Collection $people, string $text): ?Person
    {
        foreach ($people as $person) {
            foreach (array_filter([$person->first_name, $person->last_name, $person->full_name]) as $name) {
                if ($name && preg_match('/\b' . preg_quote($name, '/') . '\b/i', $text)) {
                    return $person;
                }
            }
        }

        return null;
    }

    private function validatedItem(Request $request, bool $partial): array
    {
        $data = $request->validate($this->itemRules($partial));
        $this->assertReferencedRowsBelongToUser($data);

        if (!$partial) {
            $data['status'] ??= 'todo';
            $data['priority'] ??= 'medium';
            $data['ai_generated'] ??= false;
        }

        return $data;
    }

    private function planRules(bool $partial): array
    {
        $text = $partial ? 'sometimes|nullable|string' : 'nullable|string';

        return [
            'title' => ($partial ? 'sometimes|' : 'required|') . 'string|max:255',
            'status' => [$partial ? 'sometimes' : 'nullable', Rule::in(['draft', 'active', 'paused', 'complete'])],
            'objective' => $text,
            'summary' => $text,
            'known_context' => ($partial ? 'sometimes|' : 'nullable|') . 'array',
            'risks' => ($partial ? 'sometimes|' : 'nullable|') . 'array',
            'open_questions' => ($partial ? 'sometimes|' : 'nullable|') . 'array',
            'messaging_angles' => ($partial ? 'sometimes|' : 'nullable|') . 'array',
            'metadata' => ($partial ? 'sometimes|' : 'nullable|') . 'array',
        ];
    }

    private function itemRules(bool $partial): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $optional = $partial ? 'sometimes|nullable' : 'nullable';

        return [
            'type' => [$partial ? 'sometimes' : 'required', Rule::in(['next_step', 'milestone', 'risk', 'question', 'stakeholder_action'])],
            'title' => "{$required}|string|max:255",
            'description' => "{$optional}|string",
            'status' => [$partial ? 'sometimes' : 'nullable', Rule::in(['todo', 'in_progress', 'done', 'dismissed'])],
            'priority' => [$partial ? 'sometimes' : 'nullable', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'due_at' => "{$optional}|date",
            'person_id' => "{$optional}|uuid",
            'task_id' => "{$optional}|uuid",
            'source_type' => "{$optional}|string|max:100",
            'source_id' => "{$optional}|string|max:100",
            'operation_key' => "{$optional}|uuid",
            'ai_generated' => ($partial ? 'sometimes|' : 'nullable|') . 'boolean',
            'ai_confidence' => "{$optional}|integer|min:0|max:100",
            'metadata' => "{$optional}|array",
        ];
    }

    private function assertReferencedRowsBelongToUser(array $data): void
    {
        if (!empty($data['person_id'])) {
            abort_if(!Person::where('user_id', auth()->id())->where('id', $data['person_id'])->exists(), 422, 'person_id does not belong to this user.');
        }

        if (!empty($data['task_id'])) {
            abort_if(!Task::where('user_id', auth()->id())->where('id', $data['task_id'])->exists(), 422, 'task_id does not belong to this user.');
        }
    }

    private function loadPlan(AccountPlan $plan): AccountPlan
    {
        return $plan->fresh()->load([
            'company',
            'items.person:id,first_name,last_name,avatar_url,title,company_id',
            'items.task',
        ]);
    }

    private function authorizeCompany(Company $company): void
    {
        abort_if($company->user_id !== auth()->id(), 403);
    }

    private function authorizePlan(AccountPlan $plan): void
    {
        abort_if($plan->user_id !== auth()->id(), 403);
    }
}
