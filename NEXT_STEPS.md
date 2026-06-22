# Kontakti — Next Steps

_Last updated: 2026-05-31 (session 6)_

This is the active-work list. Things that are done live in commit history (see `HANDOFF.md` for the rolling inventory). Things that are wishful or speculative live in the "Backlog" section at the bottom.

---

## Currently shipped and live

- ✅ Backend: Contact Review workflow (`GET /people/health`, `POST /people/{id}/review`, `?needs_review=1` filter, import-time `needs_review` flagging). Live in prod as of 2026-05-29.
- ✅ iOS: Review Contacts screen (Settings → Review contacts).
- ✅ iOS: Apple Contacts writeback with diff-then-confirm.
- ✅ iOS: All `.onChange(of:perform:)` deprecation warnings cleared.
- ✅ Android: Auth gate (login + register + Google sign-in) — the app was previously unusable without a token.
- ✅ Android: Companies, Discussions, Feed screens — full iOS parity.
- ✅ Android: Onboarding wizard (Welcome → Phone → Google → Done).
- ✅ Android: Contact Review screen.
- ✅ Android: Google `OkHttp` Bearer interceptor (was no-op before).
- ✅ Android: Google access token exchange via `GoogleAuthUtil.getToken` (was returning `serverAuthCode` with no exchange).
- ✅ Web: Review Contacts page — health-bucket summary cards + paginated needs_review queue with "Mark reviewed" button. Nav item with amber badge. Deployed 2026-05-29.
- ✅ MCP server Phase 1 (read-only) — `POST /api/v1/mcp` JSON-RPC endpoint with 7 tools: `search_contacts`, `get_person`, `list_recent_discussions`, `get_person_timeline`, `find_overdue_followups`, `get_contact_health`, `who_should_i_reconnect_with`. Token management in Settings → MCP access tokens. Deployed 2026-05-29.
- ✅ MCP server Phase 2 (write) — 5 write tools with diff-then-confirm (dry run by default, `apply:true` to commit): `log_discussion`, `update_person`, `create_followup_task`, `mark_contact_reviewed`, `add_note`. Gated behind the `mcp:write` token ability (read-only tokens rejected with -32604). Settings has a read-only token toggle + per-token access badge. Verified end-to-end against prod. Deployed 2026-05-29.
- ✅ MCP server Phase 3 (agentic) — `bulk_review_imports` (write, bulk mark-reviewed scoped to caller's own pending rows), `suggest_who_to_introduce` (read, shared city/tag heuristic), `draft_check_in_message` (read, reuses MessageDrafter, respects do-not-contact, never sends). 15 MCP tools total. Tenant isolation + auth proven with a real two-user prod test (cross-user read/write both blocked; unauth → 401). Deployed 2026-05-30.
- ✅ Contact cadence + precomputed reach-out timeline — per-person `contact_cadence` (default quarterly) + birthday/holiday toggles, captured on the quiz "do you know this person" screen and the person edit screens (web + iOS + Android). `contact_schedule` table materialized daily (06:30) by `kontakti:rebuild-contact-schedule` for ALL users, 6 months out. Queryable API (`/contact-schedule`, `/suggestions`) + MCP (`who_should_i_reconnect_with` now reads the stored timeline; new `upcoming_contact_schedule`). "In the mood to reach out?" panel on web Today. Verified end-to-end against prod (overdue detection + suggestions). Deployed 2026-05-30. 16 MCP tools total. **Action: confirm hPanel has a cron running `php artisan schedule:run` every minute (drives the nightly rebuild + sync).**
- ✅ iOS: Apple Contact link cloud backup — opt-in toggle in Settings → Apple Contacts. Links backed up on save/delete, restored from cloud on app launch. Backend: `apple_contact_links` table + REST endpoints. iOS build clean 2026-05-29.
- ✅ Web: Edit company modal — already existed (EditCompanyModal + pencil-icon toggle in CompanyDetailModal header). Confirmed wired. 2026-05-30.
- ✅ Web: Notes section in PersonDetailModal — already existed (Notes tab with full list/create/edit/delete via NoteEditor). Confirmed wired. 2026-05-30.
- ✅ Web: Pagination on People and Companies list pages — already existed (Load more button, page accumulation). Confirmed wired. 2026-05-30.
- ✅ Web: TasksPage — enhanced to show linked person name (clickable → opens PersonDetailModal). Backend `GET /tasks` now eager-loads `taskable` relation and supports `?completed=true/false` filter. Deployed 2026-05-30.
- ✅ Android: Settings sub-screens — QR pairing (generates QR from auth token for cross-device login), sync direction picker (Two-way / Download-only / Upload-only, persisted in DataStore, respected by SyncWorker), onboarding re-trigger (clears `kontakti_onboarded` flag → app transitions back to OnboardingScreen). 2026-05-30.
- ✅ iOS: Dark mode fix — `TextField(axis: .vertical)` + `.roundedBorder` silently drops its style in iOS 18 dark mode (black-on-black). Fixed in QuizCard.swift and VoiceResultReviewView.swift with manual `tertiarySystemGroupedBackground` fill + explicit `.foregroundColor(.primary)`. 2026-05-31.
- ✅ Android: Dark mode enabled app-wide via `KontaktiTheme` — was defaulting to `lightColorScheme()` regardless of system setting. `KontaktiTheme` now uses `isSystemInDarkTheme()`, dynamic color on API 31+, audited hardcoded `Color.White` / `Color(0xFF…)` literals in Login/Onboarding/Components/PhotoGallery/ReviewContacts. 2026-05-31.
- ✅ Cross-device sync improvements — iOS: `kontaktiDidBecomeActive` notification fires on `scenePhase == .active`; People/Companies/Discussions/Feed ViewModels subscribe and call `load(reset: true)`. Android: `MainActivity.onResume` enqueues `SyncWorker` (KEEP policy) so the download phase runs every time the app comes to foreground. Android: pull-to-refresh added to PeopleListScreen. Web: global `staleTime` reduced from 60 s → 5 s so cross-device edits are visible within seconds. 2026-05-31.
- ✅ Web: Dark mode — Tailwind `darkMode: 'media'`, body dark style in `index.css`, full `dark:` class sweep across all pages and components. Follows system preference (no manual toggle, consistent with Android). 2026-05-31.

---

## In progress

(none — last session closed all open tasks)

---

## Shipped 2026-06-01

- ✅ **Quick-log outreach** — `POST /people/{id}/log-contact` endpoint. Web: QuickLogBar in PersonDetailModal (Interactions tab). iOS: QuickLogBarView in PersonDetailView. Android: QuickLogBar composable in PersonDetailScreen. All platforms write to reach_out_log and update last_contacted_at in one tap.
- ✅ **Reconnect page (web)** — lists all contacts sorted by longest silence first. Overdue badge, inline quick-log chips, "overdue-only" filter. Nav item between Today and People.
- ✅ **AI-enhanced suggestions** — `/contact-schedule/suggestions` now returns `days_since`, `overdue_days`, and a human-readable `why` field. Today suggestion cards display the why text.

---

## Shipped 2026-06-06

- ✅ **Gamification — relationship-fitness Progress page (web)** — turns existing data (`reach_out_log`, per-person cadence, completed tasks) into a motivation layer. Computed entirely on the fly, **no new tables/migration**.
  - Backend: `GET /gamification/dashboard` → `GamificationController` → `GamificationService::dashboardFor(user)`. Returns a **Fitness score** (0–100, weighted 65% In-Touch = % of cadence-tracked people seen within their window, 35% Curation = % of contacts that are clean/reviewed), a **weekly goal** ("reach out to N people," N scaled to overdue backlog, progress = distinct people contacted this ISO week), a **weekly streak** (consecutive Mon-start weeks with ≥1 outreach, current + longest + `at_risk`), **XP + level** (touches×10 + reviewed×5 + tasks×15, triangular curve, named tiers), **8 achievements** (earned/locked w/ progress), and a contextual **encouragement** line (5 tones). Cadence math mirrors `PeopleController::reconnect` exactly.
  - Web: new **Progress** nav item (Trophy icon, between Today and Reconnect) with a goal-remaining badge. `ProgressPage.tsx` — fitness ring, level/XP bar, totals, goal + streak cards, two sub-score bars, achievements grid. Dark-mode swept. Verified with `tsc --noEmit` (clean) + rendered light/dark via a throwaway stubbed preview.
  - **Not yet ported to iOS/Android** (see short list). **Not yet deployed** — needs `bash deploy.sh` from the Mac (full: backend route + SPA).

## Next up — short list

### 1. Cross-device sync smoke test (manual, all three platforms)

Now that sync reliability is improved, run this matrix before shipping:

| Step | Action | Expected |
|---|---|---|
| 1 | Add a contact on iPhone | Appears in iOS People list immediately |
| 2 | Open Android People list | Contact appears (SyncWorker just ran via onResume) |
| 3 | Pull-to-refresh on Android | Confirms fresh data |
| 4 | Open web, navigate to People | Contact appears within 5s stale window |
| 5 | Edit the contact on web | Save, switch to iOS People tab (navigate away + back, or background + foreground) → see update |
| 6 | Edit on Android → switch to web | Within 5s refresh window, change appears |
| 7 | Log a discussion on iOS | Appears on Android Discussions (navigate to tab) and web Discussions |

**Key thing to watch:** Dark mode on all three platforms with system dark mode enabled. All screens should look consistent.

### 2. Smoke-test on a real iPhone + Android device (TestFlight / sideload)

The iOS and Android apps both build clean but haven't been run on real hardware since the dark mode + sync work landed. Install both:

```bash
# iOS archive for TestFlight:
cd iOS/KontaktiApp
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project KontaktiApp.xcodeproj -scheme KontaktiApp \
             -configuration Release -destination 'generic/platform=iOS' \
             archive -archivePath build/Kontakti.xcarchive

# Android debug APK for direct install:
cd Android/KontaktiAndroid
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
  ./gradlew :app:assembleDebug --no-daemon
# APK at: app/build/outputs/apk/debug/app-debug.apk
```

### 3. Re-verify Android Google contacts import end-to-end

The fix landed (real OAuth access token via `GoogleAuthUtil`) but only Kotlin-compile-verified. On a real device with a real Google account, walk through Settings → Import contacts → Gmail.

---

## Backlog (not scheduled, here so it doesn't get forgotten)

### MCP server for Claude/Cursor/etc. to read & write contacts

**Phase 1 shipped 2026-05-29.** Claude Desktop / Claude Code config:
```json
{ "type": "http", "url": "https://kontakti.app/api/v1/mcp",
  "headers": { "Authorization": "Bearer <token-from-settings>" } }
```

Remaining phases:

- ✅ **Phase 2 (write) — shipped 2026-05-29.** `log_discussion`, `update_person`, `create_followup_task`, `mark_contact_reviewed`, `add_note`, all diff-then-confirm (dry run by default, `apply:true` to commit), gated behind the `mcp:write` token ability.
- **Phase 3 (agentic):** `bulk_review_imports`, `suggest_who_to_introduce`, `draft_check_in_message` (returns text, doesn't send).

### Existing wish-list (carried over from prior sessions)

- ~~**Edit company** — detail modal is read-only on web. iOS has it; web doesn't.~~ Done (was already implemented).
- ~~**Task management UI** — tasks show in person timelines but no standalone tasks page on web.~~ Done — Tasks page exists with linked-person display.
- ~~**Notes UI on web** — backend exists, web doesn't have a dedicated notes section.~~ Done (was already implemented in PersonDetailModal Notes tab).
- **Obsidian sync UI** — backend exports markdown; no frontend toggle.
- ~~**Pagination** — list pages fetch page 1 only on most surfaces. No "load more" / infinite scroll.~~ Done (was already implemented).
- **Subdomain routing** (`jason.kontakti.app`) — would need wildcard DNS in hPanel + Laravel routing.
- ~~**Android Settings sub-screens** still missing vs iOS: QR pairing, sync-direction picker, Onboarding re-trigger.~~ Done 2026-05-30.
- **iOS / Android unit tests** — none written.
- **Backend test suite** — Pest/PHPUnit scaffold exists, no real tests around auth, imports, or migration repair.

### Polish

- ~~**iOS LinkedIn paste fallback** — added 2026-05-30. `LinkedInPasteView` lets users paste raw page HTML from Safari; calls the same `EnrichmentService.enrich()` and populates the same review form as the WebView path. Surfaced as "Paste HTML manually" (secondary button with footer hint) below the Enrich button on `LinkedInImportView`.~~ Done.
- Deploy script doesn't fail on Composer dependency conflicts (it's mostly clean now but still permissive).
- Production logs still contain old stack traces from before fixes; rotate periodically.

---

## Known live caveats

- iOS Apple Contacts writeback ships but is untested against a real device with the modern CN privacy gates.
- Android Gmail import flow (the Settings → Import contacts → Gmail path) compiles clean but was only verified to OAuth-handshake-and-fetch in code review, not in an emulator with a real Google account.
- The enrichment proxy at `enrich.kontakti.app` runs on a Windows box behind a Cloudflare Tunnel. If that box is off, LinkedIn import on iOS fails open with a clear error.
