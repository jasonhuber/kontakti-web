<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Discussion, Note, Task, ActivityFeedItem};
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\DB;

/**
 * MCP-over-HTTP server.
 *
 * Speaks JSON-RPC 2.0. Clients pass a Bearer token. Tokens carry abilities:
 *  - 'mcp:read'  — read tools (search, get, lists, health).
 *  - 'mcp:write' — write tools (log_discussion, update_person, …).
 * Normal app tokens carry the wildcard '*' and can do both.
 *
 * Write tools follow a diff-then-confirm protocol: every write tool defaults
 * to a dry run that returns a preview of the change and applies nothing. The
 * caller re-invokes with `apply: true` to commit. This keeps a human in the
 * loop for every mutation.
 *
 * Configure in Claude Desktop / Claude Code:
 *   { "type": "http", "url": "https://kontakti.app/api/v1/mcp",
 *     "headers": { "Authorization": "Bearer <mcp-token>" } }
 */
class McpController extends Controller
{
    private const PROTOCOL_VERSION = '2024-11-05';

    private const WRITE_TOOLS = [
        'log_discussion', 'update_person', 'create_followup_task',
        'mark_contact_reviewed', 'add_note', 'bulk_review_imports',
    ];

    // ── JSON-RPC handler ────────────────────────────────────────────────────

    public function handle(Request $request): JsonResponse
    {
        $rpc = $request->json()->all();
        $method = $rpc['method'] ?? '';
        $id     = $rpc['id'] ?? null;
        $params = $rpc['params'] ?? [];

        return match ($method) {
            'initialize'              => $this->initialize($id),
            'notifications/initialized' => response()->json(['jsonrpc' => '2.0', 'id' => $id, 'result' => null]),
            'ping'                    => $this->ok($id, []),
            'tools/list'              => $this->toolsList($id),
            'tools/call'              => $this->toolsCall($params, $id),
            default                   => $this->rpcError($id, -32601, 'Method not found: ' . $method),
        };
    }

    // ── Token management ────────────────────────────────────────────────────

    public function listTokens(Request $request): JsonResponse
    {
        $tokens = auth()->user()
            ->tokens()
            ->where(fn($q) => $q
                ->where('name', 'like', 'mcp-%')
                ->orWhereJsonContains('abilities', 'mcp:read')
            )
            ->get()
            ->map(fn($t) => [
                'id'           => $t->id,
                'name'         => $t->name,
                'abilities'    => $t->abilities,
                'last_used_at' => $t->last_used_at?->toIso8601String(),
                'created_at'   => $t->created_at->toIso8601String(),
            ]);

        return response()->json($tokens);
    }

    public function createToken(Request $request): JsonResponse
    {
        $name = $request->input('name', 'mcp-' . now()->format('Ymd'));

        // Read+write by default; pass read_only=true to mint a read-only token.
        $abilities = $request->boolean('read_only')
            ? ['mcp:read']
            : ['mcp:read', 'mcp:write'];

        $pat = auth()->user()->createToken($name, $abilities);

        return response()->json([
            'token'      => $pat->plainTextToken,
            'id'         => $pat->accessToken->id,
            'name'       => $name,
            'abilities'  => $abilities,
            'created_at' => $pat->accessToken->created_at->toIso8601String(),
        ], 201);
    }

    public function revokeToken(Request $request, int $tokenId): JsonResponse
    {
        $deleted = auth()->user()
            ->tokens()
            ->where('id', $tokenId)
            ->delete();

        abort_if(!$deleted, 404, 'Token not found');

        return response()->json(null, 204);
    }

    // ── MCP methods ─────────────────────────────────────────────────────────

    private function initialize(mixed $id): JsonResponse
    {
        return $this->ok($id, [
            'protocolVersion' => self::PROTOCOL_VERSION,
            'capabilities'    => ['tools' => []],
            'serverInfo'      => ['name' => 'kontakti', 'version' => '1.0.0'],
        ]);
    }

    private function toolsList(mixed $id): JsonResponse
    {
        return $this->ok($id, ['tools' => $this->tools()]);
    }

    private function toolsCall(array $params, mixed $id): JsonResponse
    {
        $name = $params['name'] ?? '';
        $args = $params['arguments'] ?? [];

        // Write tools require the 'mcp:write' ability. Read-only tokens are rejected.
        if (in_array($name, self::WRITE_TOOLS, true) && !auth()->user()->tokenCan('mcp:write')) {
            return $this->rpcError($id, -32604,
                "This token is read-only. The tool '{$name}' needs write access — mint a read+write MCP token in Settings.");
        }

        try {
            $text = match ($name) {
                'search_contacts'          => $this->toolSearchContacts($args),
                'get_person'               => $this->toolGetPerson($args),
                'list_recent_discussions'  => $this->toolListRecentDiscussions($args),
                'get_person_timeline'      => $this->toolGetPersonTimeline($args),
                'find_overdue_followups'   => $this->toolFindOverdueFollowups($args),
                'get_contact_health'       => $this->toolGetContactHealth(),
                'who_should_i_reconnect_with' => $this->toolWhoToReconnect($args),
                'log_discussion'           => $this->toolLogDiscussion($args),
                'update_person'            => $this->toolUpdatePerson($args),
                'create_followup_task'     => $this->toolCreateFollowupTask($args),
                'mark_contact_reviewed'    => $this->toolMarkContactReviewed($args),
                'add_note'                 => $this->toolAddNote($args),
                'bulk_review_imports'      => $this->toolBulkReviewImports($args),
                'suggest_who_to_introduce' => $this->toolSuggestWhoToIntroduce($args),
                'draft_check_in_message'   => $this->toolDraftCheckInMessage($args),
                default => throw new \InvalidArgumentException("Unknown tool: {$name}"),
            };
        } catch (\InvalidArgumentException $e) {
            return $this->rpcError($id, -32602, $e->getMessage());
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return $this->rpcError($id, -32602, 'Record not found (check the ID and that it belongs to you).');
        } catch (\Exception $e) {
            return $this->rpcError($id, -32603, 'Tool execution failed: ' . $e->getMessage());
        }

        return $this->ok($id, [
            'content' => [['type' => 'text', 'text' => $text]],
        ]);
    }

    // ── Tools ────────────────────────────────────────────────────────────────

    private function toolSearchContacts(array $args): string
    {
        $query = $args['query'] ?? '';
        if (!$query) throw new \InvalidArgumentException('query is required');

        $limit = min((int)($args['limit'] ?? 10), 50);
        $user  = auth()->user();

        $people = $user->people()
            ->with(['company', 'emails', 'phones'])
            ->search($query)
            ->limit($limit)
            ->get();

        if ($people->isEmpty()) {
            return "No contacts found matching \"{$query}\".";
        }

        $lines = ["Found {$people->count()} contact(s) matching \"{$query}\":\n"];
        foreach ($people as $p) {
            $lines[] = $this->personSummary($p);
        }
        return implode("\n", $lines);
    }

    private function toolGetPerson(array $args): string
    {
        $id = $args['person_id'] ?? '';
        if (!$id) throw new \InvalidArgumentException('person_id is required');

        $person = auth()->user()->people()
            ->with(['company', 'tags', 'emails', 'phones'])
            ->withCount(['discussions', 'tasks' => fn($q) => $q->pending()])
            ->findOrFail($id);

        $lines = [$this->personSummary($person, detailed: true)];
        if ($person->notes) $lines[] = "\nNotes: {$person->notes}";
        if ($person->discussions_count) $lines[] = "Discussions: {$person->discussions_count}";
        if ($person->tasks_count) $lines[] = "Open tasks: {$person->tasks_count}";
        return implode("\n", $lines);
    }

    private function toolListRecentDiscussions(array $args): string
    {
        $limit  = min((int)($args['limit'] ?? 10), 50);
        $offset = max((int)($args['offset'] ?? 0), 0);

        $discussions = auth()->user()->discussions()
            ->with('participants')
            ->orderByDesc('date')
            ->skip($offset)
            ->take($limit)
            ->get();

        if ($discussions->isEmpty()) {
            return 'No discussions found.';
        }

        $lines = ["Recent {$discussions->count()} discussion(s):\n"];
        foreach ($discussions as $d) {
            $who   = $d->participants->pluck('full_name')->implode(', ') ?: 'No participants';
            $lines[] = "• [{$d->date}] {$d->title} ({$d->type}) — with {$who}" .
                ($d->summary ? "\n  Summary: {$d->summary}" : '');
        }
        return implode("\n", $lines);
    }

    private function toolGetPersonTimeline(array $args): string
    {
        $id = $args['person_id'] ?? '';
        if (!$id) throw new \InvalidArgumentException('person_id is required');

        $person = auth()->user()->people()->findOrFail($id);

        $discussions = $person->discussions()->orderByDesc('date')->limit(10)->get();
        $tasks       = $person->tasks()->orderByDesc('created_at')->limit(10)->get();
        $notes       = $person->notes()->orderByDesc('created_at')->limit(5)->get();

        $events = collect();
        foreach ($discussions as $d) {
            $events->push(['date' => $d->date, 'type' => 'discussion',
                'text' => "{$d->title} ({$d->type})" . ($d->summary ? " — {$d->summary}" : '')]);
        }
        foreach ($tasks as $t) {
            $events->push(['date' => $t->completed_at ?? $t->due_at ?? $t->created_at,
                'type' => 'task', 'text' => "{$t->title} [" . ($t->completed_at ? 'done' : 'open') . "]"]);
        }
        foreach ($notes as $n) {
            $events->push(['date' => $n->created_at, 'type' => 'note',
                'text' => $n->title ?? substr($n->body, 0, 80)]);
        }

        $events = $events->sortByDesc('date')->values();

        if ($events->isEmpty()) {
            return "No timeline events for {$person->full_name}.";
        }

        $lines = ["Timeline for {$person->full_name}:\n"];
        foreach ($events as $e) {
            $date = is_string($e['date']) ? substr($e['date'], 0, 10) : $e['date']?->format('Y-m-d');
            $lines[] = "• [{$date}] {$e['type']}: {$e['text']}";
        }
        return implode("\n", $lines);
    }

    private function toolFindOverdueFollowups(array $args): string
    {
        $limit = min((int)($args['limit'] ?? 20), 50);

        $people = auth()->user()->people()
            ->overdue()
            ->orderBy('next_followup_at')
            ->limit($limit)
            ->get();

        if ($people->isEmpty()) {
            return 'No overdue follow-ups.';
        }

        $lines = ["Found {$people->count()} overdue follow-up(s):\n"];
        foreach ($people as $p) {
            $due   = $p->next_followup_at ? substr($p->next_followup_at, 0, 10) : '?';
            $lines[] = "• {$p->full_name} — due {$due}" .
                ($p->email ? " <{$p->email}>" : '') .
                ($p->company ? " ({$p->company->name})" : '');
        }
        return implode("\n", $lines);
    }

    private function toolGetContactHealth(): string
    {
        $base  = auth()->user()->people();
        $total = (clone $base)->count();

        $buckets = [
            'missing_first_name'  => (clone $base)->where(fn($q) => $q->whereNull('first_name')->orWhere('first_name', ''))->count(),
            'missing_last_name'   => (clone $base)->where(fn($q) => $q->whereNull('last_name')->orWhere('last_name', ''))->count(),
            'missing_contact_info'=> (clone $base)->where(fn($q) => $q->whereNull('email')->orWhere('email', ''))->where(fn($q) => $q->whereNull('phone')->orWhere('phone', ''))->count(),
            'invalid_email'       => (clone $base)->whereNotNull('email')->where('email', '!=', '')->whereRaw("email NOT LIKE '%_@_%._%'")->count(),
            'needs_review'        => (clone $base)->where('needs_review', true)->count(),
            'imported_unreviewed' => (clone $base)->whereNull('reviewed_at')->whereRaw("JSON_EXTRACT(metadata, '$.import_source') IS NOT NULL")->count(),
        ];

        $lines = ["Contact health summary ({$total} total contacts):\n"];
        foreach ($buckets as $key => $count) {
            if ($count > 0) {
                $label = str_replace('_', ' ', ucfirst($key));
                $lines[] = "• {$label}: {$count}";
            }
        }
        if (count($lines) === 1) {
            $lines[] = "All contacts look healthy.";
        }
        return implode("\n", $lines);
    }

    private function toolWhoToReconnect(array $args): string
    {
        $limit = min((int)($args['limit'] ?? 10), 25);

        $people = auth()->user()->people()
            ->where(fn($q) => $q
                ->where('next_followup_at', '<=', now())
                ->orWhere(function($q) {
                    $q->whereNull('next_followup_at')
                      ->where('last_contacted_at', '<=', now()->subDays(90));
                })
            )
            ->whereNotNull('last_contacted_at')
            ->where('do_not_contact', false)
            ->orderBy('next_followup_at')
            ->limit($limit)
            ->get();

        if ($people->isEmpty()) {
            return 'Everyone is up to date — no reconnects needed right now.';
        }

        $lines = ["Top {$people->count()} person(s) to reconnect with:\n"];
        foreach ($people as $p) {
            $last  = $p->last_contacted_at ? substr($p->last_contacted_at, 0, 10) : 'never';
            $lines[] = "• {$p->full_name} — last contact: {$last}" .
                ($p->company ? " ({$p->company->name})" : '') .
                ($p->next_followup_at ? ", follow-up due " . substr($p->next_followup_at, 0, 10) : '');
        }
        return implode("\n", $lines);
    }

    // ── Write tools (diff-then-confirm) ──────────────────────────────────────

    private function toolLogDiscussion(array $args): string
    {
        $personId = $args['person_id'] ?? '';
        $title    = trim((string)($args['title'] ?? ''));
        if (!$personId) throw new \InvalidArgumentException('person_id is required');
        if ($title === '') throw new \InvalidArgumentException('title is required');

        $person = auth()->user()->people()->findOrFail($personId);

        $type = $args['type'] ?? 'other';
        $allowed = ['call', 'meeting', 'email', 'message', 'event', 'other'];
        if (!in_array($type, $allowed, true)) {
            throw new \InvalidArgumentException('type must be one of: ' . implode(', ', $allowed));
        }
        $date    = !empty($args['date']) ? \Carbon\Carbon::parse($args['date']) : now();
        $summary = $args['summary'] ?? null;
        $apply   = (bool)($args['apply'] ?? false);

        $preview = [
            "Log a {$type} discussion with {$person->full_name}:",
            "  Title:   {$title}",
            "  Date:    " . $date->format('Y-m-d'),
            $summary ? "  Summary: {$summary}" : "  Summary: (none)",
            "  Also updates {$person->full_name}'s last-contacted date to {$date->format('Y-m-d')}.",
        ];

        if (!$apply) {
            return $this->dryRun($preview);
        }

        $discussion = Discussion::create([
            'user_id' => auth()->id(),
            'title'   => $title,
            'date'    => $date,
            'type'    => $type,
            'summary' => $summary,
        ]);
        $discussion->participants()->attach($person->id);

        if (is_null($person->last_contacted_at) || $person->last_contacted_at->lt($date)) {
            $person->update(['last_contacted_at' => $date]);
        }
        ActivityFeedItem::log('discussion', $discussion->id, 'created');

        return "✓ Logged discussion \"{$title}\" with {$person->full_name} (ID: {$discussion->id}).";
    }

    private function toolUpdatePerson(array $args): string
    {
        $personId = $args['person_id'] ?? '';
        if (!$personId) throw new \InvalidArgumentException('person_id is required');

        $person = auth()->user()->people()->findOrFail($personId);

        // Whitelisted scalar fields only — relational/contact-table edits go
        // through the full app to keep this surface safe.
        $editable = [
            'first_name', 'last_name', 'nickname', 'email', 'phone', 'title',
            'job_department', 'relationship_strength', 'notes', 'linkedin_url',
            'next_followup_at', 'birthday', 'city', 'region', 'country', 'how_we_met',
        ];
        $strengths = ['cold', 'warm', 'hot', 'close'];

        $changes = [];
        foreach ($editable as $field) {
            if (!array_key_exists($field, $args)) continue;
            $new = $args[$field];
            if ($field === 'relationship_strength' && !in_array($new, $strengths, true)) {
                throw new \InvalidArgumentException('relationship_strength must be one of: ' . implode(', ', $strengths));
            }
            $old = $person->getAttribute($field);
            $oldStr = $this->scalarToString($old);
            $newStr = $this->scalarToString($new);
            if ($oldStr !== $newStr) {
                $changes[$field] = [$oldStr, $newStr, $new];
            }
        }

        if (empty($changes)) {
            return "No changes — every provided field already matches {$person->full_name}.";
        }

        $apply   = (bool)($args['apply'] ?? false);
        $preview = ["Update {$person->full_name} (ID: {$person->id}):"];
        foreach ($changes as $field => [$oldStr, $newStr]) {
            $preview[] = "  {$field}: " . ($oldStr === '' ? '(empty)' : $oldStr) . " → " . ($newStr === '' ? '(empty)' : $newStr);
        }

        if (!$apply) {
            return $this->dryRun($preview);
        }

        $person->update(array_map(fn($c) => $c[2], $changes));
        ActivityFeedItem::log('person', $person->id, 'updated');

        return "✓ Updated {$person->full_name}: " . implode(', ', array_keys($changes)) . '.';
    }

    private function toolCreateFollowupTask(array $args): string
    {
        $personId = $args['person_id'] ?? '';
        $title    = trim((string)($args['title'] ?? ''));
        if (!$personId) throw new \InvalidArgumentException('person_id is required');
        if ($title === '') throw new \InvalidArgumentException('title is required');

        $person = auth()->user()->people()->findOrFail($personId);

        $priority = $args['priority'] ?? 'medium';
        $allowed  = ['low', 'medium', 'high', 'urgent'];
        if (!in_array($priority, $allowed, true)) {
            throw new \InvalidArgumentException('priority must be one of: ' . implode(', ', $allowed));
        }
        $dueAt = !empty($args['due_at']) ? \Carbon\Carbon::parse($args['due_at']) : null;
        $desc  = $args['description'] ?? null;
        $apply = (bool)($args['apply'] ?? false);

        // A follow-up task also pulls the person's next_followup_at forward when
        // the new due date is sooner (or none is set).
        $setsFollowup = $dueAt && (is_null($person->next_followup_at) || $person->next_followup_at->gt($dueAt));

        $preview = [
            "Create a {$priority}-priority follow-up task for {$person->full_name}:",
            "  Title:    {$title}",
            "  Due:      " . ($dueAt ? $dueAt->format('Y-m-d') : '(no due date)'),
            $desc ? "  Details:  {$desc}" : "  Details:  (none)",
        ];
        if ($setsFollowup) {
            $preview[] = "  Also sets {$person->full_name}'s next follow-up to {$dueAt->format('Y-m-d')}.";
        }

        if (!$apply) {
            return $this->dryRun($preview);
        }

        $task = Task::create([
            'user_id'       => auth()->id(),
            'title'         => $title,
            'description'   => $desc,
            'due_at'        => $dueAt,
            'priority'      => $priority,
            'taskable_type' => Person::class,
            'taskable_id'   => $person->id,
        ]);
        if ($setsFollowup) {
            $person->update(['next_followup_at' => $dueAt]);
        }

        return "✓ Created follow-up task \"{$title}\" for {$person->full_name} (ID: {$task->id}).";
    }

    private function toolMarkContactReviewed(array $args): string
    {
        $personId = $args['person_id'] ?? '';
        if (!$personId) throw new \InvalidArgumentException('person_id is required');

        $person = auth()->user()->people()->findOrFail($personId);

        if (!$person->needs_review && $person->reviewed_at) {
            return "{$person->full_name} is already marked reviewed (on " . substr($person->reviewed_at, 0, 10) . ").";
        }

        $apply = (bool)($args['apply'] ?? false);
        $preview = [
            "Mark {$person->full_name} (ID: {$person->id}) as reviewed:",
            "  needs_review: " . ($person->needs_review ? 'true' : 'false') . " → false",
            "  reviewed_at:  " . ($person->reviewed_at ? substr($person->reviewed_at, 0, 10) : '(unset)') . " → " . now()->format('Y-m-d'),
        ];

        if (!$apply) {
            return $this->dryRun($preview);
        }

        $person->update(['needs_review' => false, 'reviewed_at' => now()]);

        return "✓ Marked {$person->full_name} as reviewed.";
    }

    private function toolAddNote(array $args): string
    {
        $personId = $args['person_id'] ?? '';
        $body     = trim((string)($args['body'] ?? ''));
        if (!$personId) throw new \InvalidArgumentException('person_id is required');
        if ($body === '') throw new \InvalidArgumentException('body is required');

        $person = auth()->user()->people()->findOrFail($personId);

        $titleArg = $args['title'] ?? null;
        $apply    = (bool)($args['apply'] ?? false);

        $excerpt = strlen($body) > 120 ? substr($body, 0, 120) . '…' : $body;
        $preview = [
            "Add a note to {$person->full_name} (ID: {$person->id}):",
            $titleArg ? "  Title: {$titleArg}" : "  Title: (none)",
            "  Body:  {$excerpt}",
        ];

        if (!$apply) {
            return $this->dryRun($preview);
        }

        $note = Note::create([
            'user_id'      => auth()->id(),
            'title'        => $titleArg,
            'body'         => $body,
            'notable_type' => Person::class,
            'notable_id'   => $person->id,
        ]);

        return "✓ Added note to {$person->full_name} (note ID: {$note->id}).";
    }

    // ── Phase 3: agentic tools ───────────────────────────────────────────────

    /**
     * Lists imported-but-unreviewed contacts (preview), or — with apply:true and
     * a person_ids list — bulk-marks the given contacts reviewed. Every query is
     * rooted at auth()->user(), and apply intersects the requested IDs with the
     * user's own rows so a forged ID can never touch another tenant.
     */
    private function toolBulkReviewImports(array $args): string
    {
        $apply = (bool)($args['apply'] ?? false);

        // Unreviewed imports = needs_review flag set, or imported and never reviewed.
        $base = auth()->user()->people()
            ->where(fn($q) => $q
                ->where('needs_review', true)
                ->orWhere(fn($q2) => $q2
                    ->whereNull('reviewed_at')
                    ->whereRaw("JSON_EXTRACT(metadata, '$.import_source') IS NOT NULL")
                )
            );

        if (!$apply) {
            $limit  = min((int)($args['limit'] ?? 20), 50);
            $people = (clone $base)->orderBy('created_at')->limit($limit)->get();
            $total  = (clone $base)->count();

            if ($people->isEmpty()) {
                return 'No imported contacts are awaiting review.';
            }

            $lines = ["{$total} contact(s) awaiting review. Showing first {$people->count()}:\n"];
            foreach ($people as $p) {
                $flags = [];
                if (empty($p->first_name)) $flags[] = 'no first name';
                if (empty($p->last_name))  $flags[] = 'no last name';
                if (empty($p->email) && empty($p->phone)) $flags[] = 'no email/phone';
                $src = $p->metadata['import_source'] ?? 'import';
                $lines[] = "• {$p->full_name} (ID: {$p->id}) — from {$src}"
                    . ($flags ? ' [' . implode(', ', $flags) . ']' : '');
            }
            $lines[] = "\nTo mark some reviewed, call again with apply:true and "
                . "person_ids: [...] containing the IDs to clear.";
            return implode("\n", $lines);
        }

        // apply=true — require an explicit list; never bulk-clear everything implicitly.
        $ids = $args['person_ids'] ?? null;
        if (!is_array($ids) || count($ids) === 0) {
            throw new \InvalidArgumentException('person_ids (a non-empty array) is required when apply is true.');
        }

        // Intersect requested IDs with the user's own unreviewed rows — this is the
        // tenant-isolation guard: only rows owned by the caller can be touched.
        $matched = (clone $base)->whereIn('id', $ids)->get();
        if ($matched->isEmpty()) {
            return 'None of the given IDs match your contacts awaiting review (nothing changed).';
        }

        $matchedIds = $matched->pluck('id')->all();
        auth()->user()->people()->whereIn('id', $matchedIds)
            ->update(['needs_review' => false, 'reviewed_at' => now()]);

        $names = $matched->map(fn($p) => $p->full_name)->take(10)->implode(', ');
        $extra = $matched->count() > 10 ? ' …' : '';
        $skipped = count($ids) - $matched->count();
        return "✓ Marked {$matched->count()} contact(s) reviewed: {$names}{$extra}."
            . ($skipped > 0 ? " ({$skipped} ID(s) ignored — not yours or not pending.)" : '');
    }

    /**
     * Heuristic introduction suggestions among the caller's own contacts: people
     * who share a city or a tag but work at different companies (colleagues are
     * skipped). Read-only.
     */
    private function toolSuggestWhoToIntroduce(array $args): string
    {
        $limit = min((int)($args['limit'] ?? 5), 15);

        $people = auth()->user()->people()
            ->where('do_not_contact', false)
            ->with('tags')
            ->get(['id', 'first_name', 'last_name', 'company_id', 'city']);

        if ($people->count() < 2) {
            return 'Not enough contacts to suggest introductions yet.';
        }

        $diffCompany = fn($a, $b) => empty($a->company_id) || empty($b->company_id) || $a->company_id !== $b->company_id;
        $pairs = [];   // keyed by "idA|idB" (sorted) to dedupe
        $add = function ($a, $b, $reason) use (&$pairs, $diffCompany) {
            if ($a->id === $b->id || !$diffCompany($a, $b)) return;
            $key = $a->id < $b->id ? "{$a->id}|{$b->id}" : "{$b->id}|{$a->id}";
            if (!isset($pairs[$key])) {
                $pairs[$key] = [$a->full_name, $b->full_name, $reason];
            }
        };

        // Group by city.
        $byCity = $people->filter(fn($p) => filled($p->city))
            ->groupBy(fn($p) => mb_strtolower(trim($p->city)));
        foreach ($byCity as $city => $group) {
            $vals = $group->values();
            for ($i = 0; $i < $vals->count(); $i++) {
                for ($j = $i + 1; $j < $vals->count(); $j++) {
                    $add($vals[$i], $vals[$j], "both in " . trim($vals[$i]->city));
                }
            }
        }

        // Group by shared tag.
        $byTag = [];
        foreach ($people as $p) {
            foreach ($p->tags as $tag) {
                $byTag[$tag->slug] ??= ['name' => $tag->name, 'people' => []];
                $byTag[$tag->slug]['people'][] = $p;
            }
        }
        foreach ($byTag as $slug => $bucket) {
            $vals = $bucket['people'];
            for ($i = 0; $i < count($vals); $i++) {
                for ($j = $i + 1; $j < count($vals); $j++) {
                    $add($vals[$i], $vals[$j], "both tagged \"{$bucket['name']}\"");
                }
            }
        }

        if (empty($pairs)) {
            return 'No natural introductions found — try adding cities or tags to your contacts.';
        }

        $pairs = array_slice(array_values($pairs), 0, $limit);
        $lines = ["Suggested introductions (" . count($pairs) . "):\n"];
        foreach ($pairs as [$a, $b, $reason]) {
            $lines[] = "• {$a} ↔ {$b} — {$reason}";
        }
        $lines[] = "\nThese are heuristic suggestions; you decide whether to make the intro.";
        return implode("\n", $lines);
    }

    /**
     * Drafts (does NOT send) a check-in message for a contact, reusing the same
     * MessageDrafter the Today inbox uses. Respects do-not-contact. Read-only.
     */
    private function toolDraftCheckInMessage(array $args): string
    {
        $personId = $args['person_id'] ?? '';
        if (!$personId) throw new \InvalidArgumentException('person_id is required');

        $person = auth()->user()->people()->findOrFail($personId);

        try {
            $draft = app(\App\Services\MessageDrafter::class)->draft($person, 'cadence_overdue');
        } catch (\RuntimeException $e) {
            // do-not-contact or drafter refusal — surface the reason, write nothing.
            return "Can't draft a message: " . $e->getMessage();
        }

        return "Draft check-in for {$person->full_name} (NOT sent — copy/edit as you like):\n\n{$draft}";
    }

    // ── Tool schema definitions ──────────────────────────────────────────────

    private function tools(): array
    {
        return [
            [
                'name'        => 'search_contacts',
                'description' => 'Search contacts by name, email, company, or keyword.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'query' => ['type' => 'string', 'description' => 'Search term'],
                        'limit' => ['type' => 'integer', 'description' => 'Max results (default 10, max 50)'],
                    ],
                    'required' => ['query'],
                ],
            ],
            [
                'name'        => 'get_person',
                'description' => 'Get full details for a specific contact by ID.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'person_id' => ['type' => 'string', 'description' => 'Kontakti person UUID'],
                    ],
                    'required' => ['person_id'],
                ],
            ],
            [
                'name'        => 'list_recent_discussions',
                'description' => 'List recent discussions (calls, meetings, emails, messages).',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'limit'  => ['type' => 'integer', 'description' => 'Number of discussions (default 10)'],
                        'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                    ],
                ],
            ],
            [
                'name'        => 'get_person_timeline',
                'description' => 'Get the chronological activity timeline (discussions, tasks, notes) for a contact.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'person_id' => ['type' => 'string', 'description' => 'Kontakti person UUID'],
                    ],
                    'required' => ['person_id'],
                ],
            ],
            [
                'name'        => 'find_overdue_followups',
                'description' => 'List contacts whose follow-up date has passed.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'limit' => ['type' => 'integer', 'description' => 'Max results (default 20)'],
                    ],
                ],
            ],
            [
                'name'        => 'get_contact_health',
                'description' => 'Get a summary of data quality issues across all contacts (missing fields, needs review, etc.).',
                'inputSchema' => ['type' => 'object', 'properties' => []],
            ],
            [
                'name'        => 'who_should_i_reconnect_with',
                'description' => 'Returns contacts who are overdue for a check-in based on follow-up dates and last-contact dates.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'limit' => ['type' => 'integer', 'description' => 'Number of suggestions (default 10)'],
                    ],
                ],
            ],

            // ── Write tools — all default to a dry run; pass apply:true to commit ──
            [
                'name'        => 'log_discussion',
                'description' => 'Log a discussion (call/meeting/email/etc.) with a contact and update their last-contacted date. Returns a preview unless apply=true.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'person_id' => ['type' => 'string', 'description' => 'Contact UUID'],
                        'title'     => ['type' => 'string', 'description' => 'Short title for the discussion'],
                        'type'      => ['type' => 'string', 'enum' => ['call', 'meeting', 'email', 'message', 'event', 'other'], 'description' => 'Discussion type (default other)'],
                        'summary'   => ['type' => 'string', 'description' => 'What was discussed'],
                        'date'      => ['type' => 'string', 'description' => 'ISO date (default today)'],
                        'apply'     => ['type' => 'boolean', 'description' => 'Set true to commit; otherwise returns a preview'],
                    ],
                    'required' => ['person_id', 'title'],
                ],
            ],
            [
                'name'        => 'update_person',
                'description' => 'Update scalar fields on a contact (name, email, phone, title, relationship_strength, notes, next_followup_at, etc.). Returns a field-level diff unless apply=true.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'person_id'             => ['type' => 'string', 'description' => 'Contact UUID'],
                        'first_name'            => ['type' => 'string'],
                        'last_name'             => ['type' => 'string'],
                        'nickname'              => ['type' => 'string'],
                        'email'                 => ['type' => 'string'],
                        'phone'                 => ['type' => 'string'],
                        'title'                 => ['type' => 'string'],
                        'job_department'        => ['type' => 'string'],
                        'relationship_strength' => ['type' => 'string', 'enum' => ['cold', 'warm', 'hot', 'close']],
                        'notes'                 => ['type' => 'string'],
                        'linkedin_url'          => ['type' => 'string'],
                        'next_followup_at'      => ['type' => 'string', 'description' => 'ISO date/datetime'],
                        'birthday'              => ['type' => 'string', 'description' => 'ISO date'],
                        'city'                  => ['type' => 'string'],
                        'region'                => ['type' => 'string'],
                        'country'               => ['type' => 'string'],
                        'how_we_met'            => ['type' => 'string'],
                        'apply'                 => ['type' => 'boolean', 'description' => 'Set true to commit; otherwise returns a diff'],
                    ],
                    'required' => ['person_id'],
                ],
            ],
            [
                'name'        => 'create_followup_task',
                'description' => 'Create a follow-up task linked to a contact (and pull their next-follow-up date forward if sooner). Returns a preview unless apply=true.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'person_id'   => ['type' => 'string', 'description' => 'Contact UUID'],
                        'title'       => ['type' => 'string', 'description' => 'Task title'],
                        'description' => ['type' => 'string'],
                        'due_at'      => ['type' => 'string', 'description' => 'ISO date/datetime'],
                        'priority'    => ['type' => 'string', 'enum' => ['low', 'medium', 'high', 'urgent'], 'description' => 'Default medium'],
                        'apply'       => ['type' => 'boolean', 'description' => 'Set true to commit; otherwise returns a preview'],
                    ],
                    'required' => ['person_id', 'title'],
                ],
            ],
            [
                'name'        => 'mark_contact_reviewed',
                'description' => 'Clear the needs-review flag on a contact and stamp reviewed_at. Returns a preview unless apply=true.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'person_id' => ['type' => 'string', 'description' => 'Contact UUID'],
                        'apply'     => ['type' => 'boolean', 'description' => 'Set true to commit; otherwise returns a preview'],
                    ],
                    'required' => ['person_id'],
                ],
            ],
            [
                'name'        => 'add_note',
                'description' => 'Attach a note to a contact. Returns a preview unless apply=true.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'person_id' => ['type' => 'string', 'description' => 'Contact UUID'],
                        'body'      => ['type' => 'string', 'description' => 'Note body'],
                        'title'     => ['type' => 'string', 'description' => 'Optional note title'],
                        'apply'     => ['type' => 'boolean', 'description' => 'Set true to commit; otherwise returns a preview'],
                    ],
                    'required' => ['person_id', 'body'],
                ],
            ],

            // ── Phase 3: agentic ──
            [
                'name'        => 'bulk_review_imports',
                'description' => 'List imported contacts awaiting review (preview). With apply=true and person_ids, bulk-marks those contacts reviewed. Only your own contacts can be affected.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'limit'      => ['type' => 'integer', 'description' => 'Max contacts to list in preview (default 20)'],
                        'person_ids' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Contact UUIDs to mark reviewed (required when apply=true)'],
                        'apply'      => ['type' => 'boolean', 'description' => 'Set true to commit the bulk review; otherwise returns the pending list'],
                    ],
                ],
            ],
            [
                'name'        => 'suggest_who_to_introduce',
                'description' => 'Suggests pairs of your contacts who might benefit from an introduction, based on shared city or tags (colleagues at the same company are skipped). Read-only.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'limit' => ['type' => 'integer', 'description' => 'Max suggestions (default 5, max 15)'],
                    ],
                ],
            ],
            [
                'name'        => 'draft_check_in_message',
                'description' => 'Drafts a check-in message for a contact using their relationship context. Returns text only — it never sends anything. Respects do-not-contact.',
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'person_id' => ['type' => 'string', 'description' => 'Contact UUID'],
                    ],
                    'required' => ['person_id'],
                ],
            ],
        ];
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** Formats a dry-run preview and tells the caller how to commit. */
    private function dryRun(array $lines): string
    {
        return "PREVIEW (nothing saved yet):\n" . implode("\n", $lines)
            . "\n\nTo apply this change, call the same tool again with \"apply\": true.";
    }

    /** Normalizes a scalar/date attribute to a comparable string for diffs. */
    private function scalarToString(mixed $value): string
    {
        if ($value === null) return '';
        if (is_bool($value)) return $value ? 'true' : 'false';
        if ($value instanceof \DateTimeInterface) return $value->format('Y-m-d');
        if ($value instanceof \Carbon\CarbonInterface) return $value->format('Y-m-d');
        return trim((string)$value);
    }

    private function personSummary(mixed $p, bool $detailed = false): string
    {
        $parts = ["{$p->full_name} (ID: {$p->id})"];
        if ($p->title || $p->company) {
            $parts[] = trim(($p->title ?? '') . ($p->company ? ' @ ' . $p->company->name : ''));
        }
        if ($detailed) {
            if ($p->email) $parts[] = "Email: {$p->email}";
            if ($p->phone) $parts[] = "Phone: {$p->phone}";
            if ($p->relationship_strength) $parts[] = "Relationship: {$p->relationship_strength}";
            if ($p->last_contacted_at) $parts[] = "Last contact: " . substr($p->last_contacted_at, 0, 10);
            if ($p->next_followup_at) $parts[] = "Follow-up due: " . substr($p->next_followup_at, 0, 10);
        } else {
            if ($p->email) $parts[] = $p->email;
        }
        return '• ' . implode(' | ', $parts);
    }

    private function ok(mixed $id, array $result): JsonResponse
    {
        return response()->json(['jsonrpc' => '2.0', 'id' => $id, 'result' => $result]);
    }

    private function rpcError(mixed $id, int $code, string $message): JsonResponse
    {
        return response()->json([
            'jsonrpc' => '2.0',
            'id'      => $id,
            'error'   => ['code' => $code, 'message' => $message],
        ]);
    }
}
