# Kontakti — Next Steps

_Last updated: 2026-05-29_

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

---

## In progress

(none — last session closed all open tasks)

---

## Next up — short list

### 1. Smoke-test on a real iPhone (manual)

The iOS app builds clean and the simulator launches it, but the App Store / TestFlight pipeline hasn't been run since the new Onboarding/Review/AppleContacts work landed. Suggested:

```bash
cd iOS/KontaktiApp
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project KontaktiApp.xcodeproj \
             -scheme KontaktiApp \
             -configuration Release \
             -destination 'generic/platform=iOS' \
             archive -archivePath build/Kontakti.xcarchive
```

Then `xcodebuild -exportArchive` with your TestFlight export options plist.

### 2. Re-verify Android Google contacts import end-to-end

The fix landed (real OAuth access token via `GoogleAuthUtil`) but only Kotlin-compile-verified. On a real device with a real Google account, walk through Settings → Import contacts → Gmail.

### 3. Web parity: Review Contacts page

Web SPA has PeoplePage filters but no `?needs_review=1` button and no `/people/health` bucket view. iOS and Android both ship this; the web is the odd one out.

### 4. MCP server (read-only first)

See "Backlog → MCP" below — this is the user-asked-for feature. Recommended approach: ship a read-only MCP server on `mcp.kontakti.app` first, then add write tools with diff-confirmation in a second pass.

### 5. Apple Contact identifier sync — opt-in cloud backup

Per-device-local mapping means a re-installed iOS app loses all the `kontakti_person ↔ CNContact.identifier` links. Optional follow-up: an opt-in "Back up my Apple Contacts links" toggle in Settings that POSTs the mapping to the backend as a private blob.

---

## Backlog (not scheduled, here so it doesn't get forgotten)

### MCP server for Claude/Cursor/etc. to read & write contacts

User asked: "Should we also expose an MCP for users to chat with their contacts using an LLM? Maybe they can update the contacts using Claude through that MCP as well?"

**Yes, in two phases.** Detail in the discussion log; high-level plan:

- **Phase 1 (read-only):** New Laravel route group under `/api/v1/mcp` speaking the MCP-over-HTTP transport. Per-user "MCP tokens" (separate Sanctum ability/scope) so revocation is independent from app tokens. Tools: `search_contacts`, `get_person`, `list_recent_discussions`, `get_person_timeline`, `find_overdue_followups`, `get_contact_health`, `search_natural`, `who_should_i_reconnect_with`. Wraps existing controllers.
- **Phase 2 (write):** `log_discussion`, `update_person`, `create_followup_task`, `mark_contact_reviewed`, `add_note`. Each write tool returns a diff preview the client can confirm before applying. Optional: a "Claude consent" model where the user pre-authorizes specific tool categories.
- **Phase 3 (agentic):** Tools shaped for long-running flows — `bulk_review_imports`, `suggest_who_to_introduce`, `draft_check_in_message` (returns text, doesn't send).

Hosting: same Laravel app, new route group, behind the same Bearer middleware but checking a token-ability. Probably worth its own subdomain (`mcp.kontakti.app`) so the user can plug it into Claude Code / Cursor / Claude Desktop without exposing the full API surface.

### Existing wish-list (carried over from prior sessions)

- **Edit company** — detail modal is read-only on web. iOS has it; web doesn't.
- **Task management UI** — tasks show in person timelines but no standalone tasks page on web (Android has nothing; iOS has it limited).
- **Notes UI on web** — backend exists, web doesn't have a dedicated notes section.
- **Obsidian sync UI** — backend exports markdown; no frontend toggle.
- **Pagination** — list pages fetch page 1 only on most surfaces. No "load more" / infinite scroll.
- **Subdomain routing** (`jason.kontakti.app`) — would need wildcard DNS in hPanel + Laravel routing.
- **Android Settings sub-screens** still missing vs iOS: QR pairing, sync-direction picker, Onboarding re-trigger.
- **iOS / Android unit tests** — none written.
- **Backend test suite** — Pest/PHPUnit scaffold exists, no real tests around auth, imports, or migration repair.

### Polish

- iOS LinkedIn import is brittle to LinkedIn login-wall changes; consider a fallback "paste-the-page-source-yourself" path.
- Deploy script doesn't fail on Composer dependency conflicts (it's mostly clean now but still permissive).
- Production logs still contain old stack traces from before fixes; rotate periodically.

---

## Known live caveats

- iOS Apple Contacts writeback ships but is untested against a real device with the modern CN privacy gates.
- Android Gmail import flow (the Settings → Import contacts → Gmail path) compiles clean but was only verified to OAuth-handshake-and-fetch in code review, not in an emulator with a real Google account.
- The enrichment proxy at `enrich.kontakti.app` runs on a Windows box behind a Cloudflare Tunnel. If that box is off, LinkedIn import on iOS fails open with a clear error.
