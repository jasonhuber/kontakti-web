# Kontakti MCP server

Kontakti exposes its data to LLM clients (Claude Desktop, Claude Code, Cursor, …)
through a [Model Context Protocol](https://modelcontextprotocol.io) server. You can
ask Claude to search your contacts, summarize a relationship, log a conversation,
or tell you who you've fallen out of touch with — all against your own account.

- **Endpoint:** `POST https://kontakti.app/api/v1/mcp` (JSON-RPC 2.0 over HTTP)
- **Transport:** streamable HTTP. One bearer token per request.
- **Tools:** 16 (read, write, agentic). See [Tools](#tools).

---

## Quick start

1. Sign in to the web app → **Settings → MCP access tokens → Create MCP token**.
   Copy the token immediately (it's shown once). Leave **Read-only** unchecked to
   allow write tools, or check it to mint a read-only token.
2. Add the server to your client config:

   **Claude Desktop / Claude Code** (`mcp` block):
   ```json
   {
     "kontakti": {
       "type": "http",
       "url": "https://kontakti.app/api/v1/mcp",
       "headers": { "Authorization": "Bearer <your-mcp-token>" }
     }
   }
   ```
3. Ask away: *"Who should I reach out to this week?"*, *"Summarize my relationship
   with Dana,"* *"Log that I had coffee with Sam today."*

---

## Authentication & isolation

Every request must carry `Authorization: Bearer <token>`. The endpoint sits behind
Laravel Sanctum (`auth:sanctum`); unauthenticated or invalid tokens get `401`.

Tokens carry **abilities**:

| Ability | Grants |
|---|---|
| `mcp:read` | all read tools |
| `mcp:write` | write tools (in addition to read) |
| `*` | everything (normal app tokens) |

A read-only token calling a write tool gets a JSON-RPC error `-32604` telling the
user to mint a read+write token. New MCP tokens default to **read + write**; pass
`read_only: true` when creating to restrict to read.

**Tenant isolation:** every tool roots its queries at `auth()->user()` and stamps
writes with `user_id = auth()->id()`. Looking up another user's record ID returns
"record not found" — data is never shared across accounts. This is verified in CI-style
prod checks with a two-user test (cross-user read *and* write are both blocked).

Manage tokens in **Settings → MCP access tokens** (create / list / revoke) or via:
```
GET    /api/v1/mcp/tokens
POST   /api/v1/mcp/tokens          { name?, read_only? }
DELETE /api/v1/mcp/tokens/{id}
```

---

## The diff-then-confirm protocol (write tools)

Write tools **never mutate on the first call.** Each defaults to a *dry run* that
returns a human-readable preview and changes nothing. The client re-invokes with
`"apply": true` to commit. This keeps a human in the loop for every mutation.

```
→ update_person { person_id, relationship_strength: "hot" }
← PREVIEW (nothing saved yet):
  Update Dana Lewis (ID: …):
    relationship_strength: cold → hot
  To apply this change, call the same tool again with "apply": true.

→ update_person { person_id, relationship_strength: "hot", apply: true }
← ✓ Updated Dana Lewis: relationship_strength.
```

---

## Tools

### Read (`mcp:read`)

| Tool | Args | Returns |
|---|---|---|
| `search_contacts` | `query`, `limit?` | matching contacts (name / email / company / keyword) |
| `get_person` | `person_id` | full detail for one contact |
| `list_recent_discussions` | `limit?`, `offset?` | recent calls/meetings/emails with participants |
| `get_person_timeline` | `person_id` | merged discussions + tasks + notes, newest first |
| `find_overdue_followups` | `limit?` | contacts whose `next_followup_at` has passed |
| `get_contact_health` | — | data-quality summary (missing fields, needs-review, …) |
| `who_should_i_reconnect_with` | `limit?` | people **due now** from the precomputed contact schedule |
| `upcoming_contact_schedule` | `days?` | forward look at scheduled check-ins / birthdays / holidays |
| `suggest_who_to_introduce` | `limit?` | heuristic intro pairs (shared city/tag, different company) |
| `draft_check_in_message` | `person_id` | a drafted check-in message (text only — never sends) |

`who_should_i_reconnect_with` and `upcoming_contact_schedule` read the stored
[contact schedule](./contact-schedule.md) — they don't recompute on the fly.
`draft_check_in_message` reuses the same drafter as the Today inbox and respects
do-not-contact.

### Write (`mcp:write`, diff-then-confirm)

| Tool | Args (besides `apply`) | Effect |
|---|---|---|
| `log_discussion` | `person_id`, `title`, `type?`, `summary?`, `date?` | create a discussion + bump `last_contacted_at` |
| `update_person` | `person_id` + whitelisted scalar fields | field-level update (name, email, cadence, etc.) |
| `create_followup_task` | `person_id`, `title`, `due_at?`, `priority?`, `description?` | task linked to the contact; pulls `next_followup_at` forward |
| `mark_contact_reviewed` | `person_id` | clear `needs_review`, stamp `reviewed_at` |
| `add_note` | `person_id`, `body`, `title?` | attach a note |
| `bulk_review_imports` | `limit?` (preview) / `person_ids[]` + `apply` | list imports awaiting review; bulk-mark reviewed |

`update_person` accepts only a safe scalar subset: `first_name`, `last_name`,
`nickname`, `email`, `phone`, `title`, `job_department`, `relationship_strength`,
`notes`, `linkedin_url`, `next_followup_at`, `birthday`, `city`, `region`,
`country`, `how_we_met`. Relational/contact-table edits go through the full app.

`bulk_review_imports` with `apply: true` intersects the requested `person_ids`
with the caller's own pending rows — a forged ID can never touch another tenant.

---

## JSON-RPC shape

Standard JSON-RPC 2.0. Examples:

```jsonc
// list tools
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }

// call a tool
{ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "search_contacts", "arguments": { "query": "dana", "limit": 5 } } }
```

Tool results come back as `result.content[0].text` (plain text). Errors use the
JSON-RPC `error` object: `-32601` method not found, `-32602` bad arguments,
`-32603` execution failure, `-32604` token lacks write ability.

---

## Implementation

All of the above lives in a single controller:
`app/Http/Controllers/API/McpController.php`. Routes are registered in
`routes/api.php` under the `auth:sanctum` group. Adding a tool = add a `tool*`
method, a `match` arm in `toolsCall`, and a schema entry in `tools()` (plus the
`WRITE_TOOLS` constant if it mutates).
