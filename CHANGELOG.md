# Changelog — kontakti-web

Notable changes to the backend + web SPA. Most recent at top.

The repo is small enough that this isn't an automated changelog — it's a curated narrative of what shipped and why.

---

## 2026-06-01 (3)

### "In the mood to reach out?" panel — iOS + Android Today

The contact schedule suggestions panel existed only on the web. After answering 5 quiz prompts on mobile, Today went blank. Fixed by wiring `/contact-schedule/suggestions` into both native apps.

**iOS:**
- `APIClient` — added `loadSuggestions()`, `completeSuggestion()`, `snoozeSuggestion()`
- `ReachOutSuggestion` + `ReachOutSuggestionsResponse` models added to `Models.swift`
- `TodayViewModel` — `suggestions: [ReachOutSuggestion]` published; fetched in parallel with `/today` on every `load()`; `completeSuggestion()` / `snoozeSuggestion()` optimistic-remove + server call
- `TodayView` — `ReachOutSuggestionsPanel` + `SuggestionRow` inserted between quiz carousel and today items. Empty state now checks suggestions too (won't show "caught up" if there are suggestions)

**Android:**
- `ApiService` — `getSuggestions()`, `completeSuggestion()`, `snoozeSuggestion()` endpoints
- `ReachOutSuggestion`, `ReachOutSuggestionsResponse`, `SnoozeSuggestionRequest` models
- `TodayRepository` — `loadSuggestions()`, `completeSuggestion()`, `snoozeSuggestion()`
- `TodayViewModel` — `suggestions` StateFlow; loaded on `load()`; complete/snooze actions
- `TodayScreen` — `ReachOutSuggestionsHeader` + `ReachOutSuggestionCard` composables; rendered in `LazyColumn` between quiz section and today items

---

## 2026-06-01 (2)

### Quiz screen — save note button + refresh

**Both bugs fixed on all three platforms:**

- **No save button on note** — the note textarea in QuizCard had no standalone submit path. You'd type a note and have no way to save it unless you also picked a chip answer. Fixed:
  - **Web**: `Save note →` is now a full-width indigo button that appears as soon as you type anything in the note field. Previously it was an 11px link hidden in the footer, easy to miss.
  - **iOS**: Added a full-width "Save note →" button above the footer in `QuizCard.swift`, visible when note is non-empty. Tapping it submits the note as the answer and dismisses the card.
  - **Android**: Note field didn't exist at all. Added `OutlinedTextField` + "Save note →" `Button` (visible when non-empty) to `QuizCard` in `QuizSection.kt`.

- **Refresh does nothing** — the quiz session had no way to load fresh questions once you'd exhausted the current batch.
  - **Web** (`QuizSessionPage`): Added a `RefreshCw` icon button in the top-right of the session header. Fetches `/quiz/today`, deduplicates against already-loaded prompts, and appends new ones.
  - **iOS** (`QuizSessionView`): Added a `↺` toolbar button (leading side). Calls `vm.load()`, then appends any new prompts to the local queue.
  - **Android** (`QuizSessionScreen`): Added a `Refresh` `IconButton` to the top bar actions. Calls `vm.load()` which refetches from the server.

---

## 2026-06-01

### Outreach cadence — quick-log, Reconnect page, AI-enhanced suggestions

**Backend (all deployed to prod):**
- `POST /api/v1/people/{person}/log-contact` — direct reach-out logging for any person without requiring a Today queue item. Body: `{ via, note? }`. Creates `reach_out_log`, bumps `last_contacted_at`, marks pending `contact_schedule` items as done. Returns `{ last_contacted_at, next_followup_at }`.
- `GET /api/v1/people/reconnect` — paginated people list sorted by longest silence first (nulls first). Each row includes `days_since_contact`, `cadence_target_days`, `is_overdue`, `overdue_by_days`. Excludes do-not-contact.
- `GET /api/v1/contact-schedule/suggestions` now returns `days_since`, `overdue_days`, and a human-readable `why` field explaining the recommendation.

**Web:**
- `ReconnectPage` — new "Reconnect" nav item (between Today and People). Lists all contacts by longest silence, shows overdue badge with days-past-due, inline quick-log chips per row. Filterable to overdue-only.
- `QuickLogBar` in `PersonDetailModal` Interactions tab — row of one-tap chips (Called, Texted, iMessage, Emailed, In person, Facebook, WhatsApp). Tap = instant log, no form needed. Clears overdue state in Today and Reconnect automatically.
- Suggestion cards on Today now show the `why` reasoning text beneath each person.

**iOS:**
- `QuickLogBarView` component — horizontal scrolling chip row, uses `APIClient.shared.logContactDirect()`. Added to `PersonDetailView` above the DNC panel.
- `APIClient.logContactDirect(personId:via:note:)` — calls `POST /people/{id}/log-contact`.

**Android:**
- `QuickLogBar` composable added to `PersonDetailScreen` below the quick-action row — horizontally scrollable chip row with Called/Texted/Emailed/In person/Facebook/WhatsApp.
- `ApiService.logContactDirect()`, `PeopleRepository.logContactDirect()`, `PersonDetailViewModel.logContactDirect()` wired end-to-end.

---

## 2026-05-30

_Foundational work the 2026-06-01 entries build on (cadence schedule, MCP).
Backfilled into the changelog after the fact._

### Contact cadence + precomputed reach-out timeline

Tell Kontakti how often to stay in touch with each person; it builds a stored,
queryable schedule of when to reach out (not computed on the fly).

- **Schema:** migration `2026_05_30_000001` adds `people.contact_cadence`
  (`none/monthly/quarterly/biannual/annual`, **default `quarterly`**),
  `contact_on_birthday` (default true), `contact_on_holidays` (default false), and a
  new `contact_schedule` table (`user_id`, `person_id`, `due_at`, `reason`,
  `status`, `snoozed_until`).
- **Builder:** `ContactScheduleBuilder` computes next-due dates deterministically
  from cadence interval + birthdays + holidays, ~6 months out. Overdue dates stay in
  the past so people surface as overdue; contacting someone auto-completes satisfied
  rows. An LLM only polishes suggestions — it never decides the dates.
- **Schedule:** `kontakti:rebuild-contact-schedule` (daily 06:30, **all** users,
  independent of the Gmail-gated nightly sync).
- **API:** `GET /contact-schedule` (queryable timeline), `/contact-schedule/suggestions`,
  `POST /contact-schedule/{id}/complete|snooze|dismiss|draft`, `/contact-schedule/rebuild`.
- **Quiz:** a `contact_cadence` question on the "do you know this person?" screen.
- **MCP:** `who_should_i_reconnect_with` reads the stored schedule; new
  `upcoming_contact_schedule` tool.
- **Clients:** cadence picker + birthday/holiday toggles on the person edit screens
  (web/iOS/Android); "In the mood to reach out?" panel on web Today.
- Full doc: [`docs/contact-schedule.md`](./docs/contact-schedule.md). Commit
  [`29ee1fe`](https://github.com/jasonhuber/kontakti-web/commit/29ee1fe).

### MCP server (Phases 1–3) — 16 tools

A Model Context Protocol server so Claude/Cursor can read and (with confirmation)
update your contacts. JSON-RPC over HTTP at `POST /api/v1/mcp`, behind Sanctum.

- **Phase 1 (read):** `search_contacts`, `get_person`, `list_recent_discussions`,
  `get_person_timeline`, `find_overdue_followups`, `get_contact_health`,
  `who_should_i_reconnect_with`. Per-user `mcp:read`/`mcp:write` token abilities;
  token management in Settings. Commit [`33cf51b`](https://github.com/jasonhuber/kontakti-web/commit/33cf51b).
- **Phase 2 (write, diff-then-confirm):** `log_discussion`, `update_person`,
  `create_followup_task`, `mark_contact_reviewed`, `add_note` — each previews the
  change and only mutates on a second `apply: true` call. Gated behind `mcp:write`
  (read-only tokens rejected `-32604`). Commit [`1f9225b`](https://github.com/jasonhuber/kontakti-web/commit/1f9225b).
- **Phase 3 (agentic):** `bulk_review_imports`, `suggest_who_to_introduce`,
  `draft_check_in_message`. Tenant isolation + auth proven with a real two-user
  prod test. Commit [`d375478`](https://github.com/jasonhuber/kontakti-web/commit/d375478).
- Full doc + client config: [`docs/mcp.md`](./docs/mcp.md).

### Web Review Contacts page

The needs-review queue + `/people/health` bucket summary, previously iOS/Android
only, now on web (sidebar "Review" with a count badge). Commit
[`33cf51b`](https://github.com/jasonhuber/kontakti-web/commit/33cf51b).

### Apple Contact link cloud backup (opt-in)

`apple_contact_links` table + `GET/POST/DELETE /apple-contact-links` so iOS can
back up the per-device `person ↔ CNContact.identifier` mapping and restore it after
a reinstall. Off by default. Commit [`33cf51b`](https://github.com/jasonhuber/kontakti-web/commit/33cf51b).

### Deploy hardening (after a brief outage)

A backend deploy left `public_html` at mode 700 (rsync carried restrictive source
perms), which makes LiteSpeed 404 every file — a short site-wide outage, recovered
by `chmod`. `deploy.sh` now normalizes `public_html` to 755 dirs / 644 files on
every deploy. Symptom/diagnostic documented in `HANDOFF.md`. Commit
[`d375478`](https://github.com/jasonhuber/kontakti-web/commit/d375478).

---

## 2026-05-29

### Contact Review workflow

- **New endpoints:** `GET /api/v1/people/health` returns count + 8 sampled rows per "needs cleanup" bucket (missing_first_name, missing_last_name, missing_contact_info, invalid_email, duplicate_email, unlinked_company, needs_review, imported_unreviewed). `POST /api/v1/people/{id}/review` sets `reviewed_at = now()` and clears `needs_review`. Idempotent.
- **New filter:** `GET /api/v1/people?needs_review=1` for the client to paginate the full needs-review list.
- **Schema:** migration `2026_05_28_000002_add_review_fields_to_people` adds nullable `reviewed_at` (timestamp) + `needs_review` (boolean, indexed). Person model fillable/casts updated.
- **Import flow:** `ContactImportController` now writes `metadata.import_warnings = [...]` and sets `needs_review = true` when a row trips a review heuristic at import time (missing last name, no email AND no phone, invalid email shape, company name present but couldn't link to a Company).

Commit: [`e946c71`](https://github.com/jasonhuber/kontakti-web/commit/e946c71)

### Cross-tenant gap closures

Earlier in the day: `DiscussionsController` and `PeopleController` had a few endpoints that didn't `abort_if($model->user_id !== auth()->id(), 403)`. Closed those gaps. Commit: [`59b565a`](https://github.com/jasonhuber/kontakti-web/commit/59b565a)

---

## 2026-05-28 and earlier

- **Today inbox, voice, push, duplicates, DNC, multi-phone/email, onboarding** — wave of features ([`e567f79`](https://github.com/jasonhuber/kontakti-web/commit/e567f79))
- **Person photos** + QA infra + voice error handling + deploy fixes ([`2a297f9`](https://github.com/jasonhuber/kontakti-web/commit/2a297f9))
- **Contact-quiz** prompts ([`67fb871`](https://github.com/jasonhuber/kontakti-web/commit/67fb871))
- **Notes UI** + delete confirmations + load-more pagination ([`1dd28f6`](https://github.com/jasonhuber/kontakti-web/commit/1dd28f6))
- **Marketing page** redesign + PHP-served-to-bypass-LiteSpeed-cache ([`860781b`](https://github.com/jasonhuber/kontakti-web/commit/860781b))
- **Google SSO** + LinkedIn enrichment UI + marketing polish + infra ([`6e351e8`](https://github.com/jasonhuber/kontakti-web/commit/6e351e8))
- **Register page**, edit person/company, tasks page ([`99e8f84`](https://github.com/jasonhuber/kontakti-web/commit/99e8f84))
- **Full UI:** login, people/company add forms, discussions, activity feed, modals ([`e344a20`](https://github.com/jasonhuber/kontakti-web/commit/e344a20))
- **Contact-centric pivot** — removed Deals, wired People + Companies pages ([`0280c49`](https://github.com/jasonhuber/kontakti-web/commit/0280c49))
- **Multi-tenancy** scaffolding + open-source setup ([`b7487b0`](https://github.com/jasonhuber/kontakti-web/commit/b7487b0))
- **Hostinger production** wiring (MySQL socket, deploy script) ([`ecebbfd`](https://github.com/jasonhuber/kontakti-web/commit/ecebbfd))
