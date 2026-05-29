<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Facades\DB;

/**
 * MCP-over-HTTP server (Phase 1 — read-only).
 *
 * Speaks JSON-RPC 2.0. Clients pass a Bearer token that has the
 * 'mcp:read' ability (or the wildcard '*' that normal app tokens carry).
 *
 * Configure in Claude Desktop / Claude Code:
 *   { "type": "http", "url": "https://kontakti.app/api/v1/mcp",
 *     "headers": { "Authorization": "Bearer <mcp-token>" } }
 */
class McpController extends Controller
{
    private const PROTOCOL_VERSION = '2024-11-05';

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
        $pat  = auth()->user()->createToken($name, ['mcp:read']);

        return response()->json([
            'token'      => $pat->plainTextToken,
            'id'         => $pat->accessToken->id,
            'name'       => $name,
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

        try {
            $text = match ($name) {
                'search_contacts'          => $this->toolSearchContacts($args),
                'get_person'               => $this->toolGetPerson($args),
                'list_recent_discussions'  => $this->toolListRecentDiscussions($args),
                'get_person_timeline'      => $this->toolGetPersonTimeline($args),
                'find_overdue_followups'   => $this->toolFindOverdueFollowups($args),
                'get_contact_health'       => $this->toolGetContactHealth(),
                'who_should_i_reconnect_with' => $this->toolWhoToReconnect($args),
                default => throw new \InvalidArgumentException("Unknown tool: {$name}"),
            };
        } catch (\InvalidArgumentException $e) {
            return $this->rpcError($id, -32602, $e->getMessage());
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
        ];
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

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
