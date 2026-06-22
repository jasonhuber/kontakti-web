# Kontakti — Handoff

_Last updated: 2026-05-29_

This is the canonical "another human or LLM is taking over" doc. Read this first.

---

## What Kontakti is

A personal relationship intelligence system. Track people, the companies they work at, the conversations you have with them, and the follow-ups they generate. Single-user per account — **not** a sales CRM. No deals, pipelines, quotas, or seats.

Hosted at [kontakti.app](https://kontakti.app). Open source, MIT licensed, self-hostable.

---

## Live URLs

| Thing | URL |
|-------|-----|
| Marketing page | https://kontakti.app |
| Web app | https://kontakti.app/app |
| API base | https://kontakti.app/api/v1 |
| Web repo | https://github.com/jasonhuber/kontakti-web |
| iOS repo | https://github.com/jasonhuber/kontakti-ios |
| Android repo | https://github.com/jasonhuber/kontakti-android |
| Enrichment proxy (LinkedIn → structured) | https://enrich.kontakti.app (Cloudflare Tunnel) |

---

## Architecture

```
                            ┌──────────────────┐
                            │  kontakti.app    │
                            │  (Hostinger)     │
                            │                  │
                            │  Laravel 12 API  │←── kontakti.app/api/v1
                            │  React SPA       │←── kontakti.app/app
                            │  MySQL (socket)  │
                            └────────▲─────────┘
                                     │ Bearer (Sanctum)
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
        ┌─────┴─────┐         ┌──────┴──────┐        ┌──────┴──────┐
        │  iOS app  │         │  Web SPA    │        │ Android app │
        │  SwiftUI  │         │  React 18   │        │ Compose     │
        │  SwiftData│         │  Vite       │        │ Room        │
        └───────────┘         └─────────────┘        └─────────────┘
                                                       
                            ┌──────────────────┐
                            │ enrich.kontakti  │  (Cloudflare Tunnel → Windows machine)
                            │  Node + phi4     │  iOS LinkedIn import → HTML → fields
                            └──────────────────┘
```

| Layer | Tech | Notes |
|---|---|---|
| Backend | Laravel 12, PHP 8.3 | REST API only. No Blade. |
| Frontend (web) | React 18 + Vite + TypeScript + Tailwind | SPA at `/app`, built to `public_html/app/` |
| DB | MySQL 8 (Hostinger shared) | **Unix socket** from server processes — TCP is blocked. Local dev uses TCP to `srv1682.hstgr.io`. |
| Auth | Laravel Sanctum | Bearer in `Authorization` header. Stored as `kontakti_token` on web, Keychain on iOS, DataStore on Android. |
| iOS | SwiftUI 5 + SwiftData + GoogleSignIn | Offline-first via SwiftData cache + `SyncQueue` actor. |
| Android | Kotlin + Compose + Room + Hilt + WorkManager | Offline-first via Room flows + `SyncWorker`. |
| Enrichment | Node/Express on Windows machine | LinkedIn HTML → phi4 (Ollama) → structured fields. Reachable via Cloudflare Tunnel. |

**Single database, `user_id` on every table.** All controllers scope to `auth()->user()` — multi-tenant by row, not by schema.

### Cross-device sync model

The backend is the hub — there is no device-to-device sync and no real-time push for data changes (FCM is push notifications only).

| Platform | When it pulls fresh data |
|---|---|
| iOS | View appears (`.task { await vm.load() }`) · Pull-to-refresh · App foreground → `kontaktiDidBecomeActive` notification → all main-tab VMs call `load(reset: true)` |
| Android | Screen created (ViewModel `refresh()` in `init`) · Pull-to-refresh (People screen) · `MainActivity.onResume` enqueues `SyncWorker` (KEEP policy) → downloads People + Companies into Room; Discussions are always API-live (no Room cache) |
| Web | TanStack Query mount · Window focus (refetchOnWindowFocus=true) · `staleTime: 5_000` — stale data shown for at most 5 s |

**Conflict model:** last writer wins. No conflict detection. Concurrent edits on two devices: the second PATCH to reach the server wins silently. Acceptable for single-user personal use.

**Offline mutations:** iOS — `SyncQueue` actor persists to disk, flushed on connectivity restore. Android — `PendingSyncEntity` in Room, replayed by `SyncWorker`. Web — none (SPA is stateless).

---

## Repo layout

This Dropbox folder mirrors three separate Git repositories:

```
Kontakti/                              (Dropbox; NOT a git repo)
├── README.md                          ← project overview
├── HANDOFF.md                         ← this file
├── NEXT_STEPS.md                      ← active work + roadmap
├── Website/                           ← git: github.com/jasonhuber/kontakti-web
│   ├── backend/                       Laravel
│   ├── frontend/                      React SPA + marketing
│   └── deploy.sh                      ssh+rsync to Hostinger
├── iOS/                               ← git: github.com/jasonhuber/kontakti-ios
│   └── KontaktiApp/                   Xcode project + project.yml (xcodegen)
├── Android/                           ← git: github.com/jasonhuber/kontakti-android
│   └── KontaktiAndroid/               Gradle project
└── enrichment-proxy/                  (Dropbox-synced; runs on Windows box)
```

The three sub-repos push to public GitHub independently. The root files (`README.md`, `HANDOFF.md`, `NEXT_STEPS.md`) live in Dropbox only and are not version-controlled — they're synced across machines but you can't `git diff` them. Treat them as the source of truth for project-level docs; per-repo READMEs link back here.

---

## Build & run — gotchas

The toolchains on this Mac look broken at first glance. They aren't — they're just non-default. Use the env-var workarounds below.

### iOS

`xcode-select -p` points to `/Library/Developer/CommandLineTools` which has no `xcodebuild`. Full Xcode is installed at `/Applications/Xcode.app` (currently 26.2, iOS 18 SDK).

```bash
cd iOS/KontaktiApp/
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project KontaktiApp.xcodeproj \
             -scheme KontaktiApp \
             -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
             -configuration Debug build
```

When you add a new Swift file, regenerate the project:

```bash
xcodegen generate
git checkout HEAD -- KontaktiApp/KontaktiApp.xcodeproj/xcshareddata/   # xcodegen drops shared schemes
```

### Android

System `java` is Temurin 8 (too old for AGP). Use Android Studio's bundled JBR (Java 21) and the SDK at `~/Library/Android/sdk`.

```bash
cd Android/KontaktiAndroid/
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
  ./gradlew :app:assembleDebug --no-daemon --console=plain
```

`local.properties` is gitignored — recreate locally with:

```
sdk.dir=/Users/jason/Library/Android/sdk
kontakti.google.web_client_id=<GOOGLE_WEB_CLIENT_ID from Website/.env>
```

The Google web client ID is fed into `BuildConfig.GOOGLE_WEB_CLIENT_ID` and used by `GoogleAuthManager.signInForIdToken`.

### Backend (local dev)

```bash
cd Website/backend
php artisan serve              # → http://localhost:8000
```

### Frontend (local dev)

```bash
cd Website/frontend
npm run dev                    # → http://localhost:5173 (proxies /api/* to :8000)
```

---

## Deploy

`deploy.sh` lives in `Website/`. It does ssh+rsync to Hostinger using `~/.ssh/id_ed25519_hostinger`.

```bash
cd Website/
bash deploy.sh                 # full: marketing + SPA + backend
bash deploy.sh --backend-only  # PHP + composer + migrate + caches
bash deploy.sh --frontend-only # npm build + rsync /app
bash deploy.sh --marketing-only
```

Backend deploys automatically run `php artisan migrate --force`. No manual SSH step required.

SSH details:

| What | Value |
|---|---|
| Host | `88.223.85.36` |
| Port | `65002` |
| User | `u675113980` |
| Key | `~/.ssh/id_ed25519_hostinger` |
| Backend path | `~/domains/kontakti.app/backend/` |
| Public path | `~/domains/kontakti.app/public_html/` |

Production `.env` lives at `~/domains/kontakti.app/backend/.env`. Local `.env` at `Website/backend/.env`. Both gitignored.

**hPanel MySQL password rule:** passwords containing `!`, `&`, or `*` get silently truncated. Use alphanumeric-only passwords when creating MySQL users via hPanel.

**Cron / scheduler:** Laravel commands are registered in `bootstrap/app.php` `withSchedule` (`kontakti:nightly-sync` 07:00, `kontakti:rebuild-contact-schedule` 06:30). These only fire if a system cron runs `php artisan schedule:run` every minute. The SSH user has **no `crontab` binary** — cron is managed in **hPanel → Cron Jobs**. If scheduled work isn't running, check/add there: `* * * * * cd ~/domains/kontakti.app/backend && /opt/alt/php83/usr/bin/php artisan schedule:run >> /dev/null 2>&1`. To run a build manually: `php artisan kontakti:rebuild-contact-schedule`.

**Docroot permissions (caused a prod outage 2026-05-30):** LiteSpeed returns 404 for EVERY file (static + PHP) if `public_html` is mode 700 — it can't traverse the docroot. `rsync -avz` preserves source perms, and macOS/Dropbox files can arrive 600/700. Symptom: site-wide 404/403 while `php artisan route:list` works fine on the server (CLI is unaffected). Fix: `chmod 755` dirs, `644` files under `public_html`. `deploy.sh` now normalizes this on every deploy, so it shouldn't recur. If diagnosing a total outage, test with a static file: `curl -sk -H "Host: kontakti.app" https://127.0.0.1/__ping.txt` from the server — if a plain `.txt` 404s, it's docroot perms, not the app.

---

## Feature inventory (2026-05-29)

### Backend

All controllers `auth()->user()`-scoped:

| Domain | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/google`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/onboarding/complete` |
| People | CRUD + `/timeline`, `/discussions`, `/tasks`, `/notes`, `/photos`, `/activity`, `/review` |
| People health | `GET /people/health` (review-queue buckets) + `?needs_review=1` filter on index |
| Companies | CRUD + `/people`, `/discussions` |
| Discussions | CRUD + `/participants/:personId` (add/remove) |
| Notes | CRUD + `/export` (Obsidian) |
| Tasks | CRUD + `/complete`, `/reopen` |
| Tags | index, store, destroy |
| Search | `GET /search?q=`, `POST /search/natural` |
| Activity feed | `GET /feed`, `POST /activity/:id/acknowledge` |
| Contact import | `POST /contacts/import` (with `import_warnings` + `needs_review` flagging) |
| Graph | `GET /graph`, `POST/DELETE /graph/links` |
| Obsidian | `GET /obsidian/status`, `POST /obsidian/export` |
| Photos | per-person multipart/data-URL/external-URL uploads, set-primary, delete |
| Today inbox | `GET /today`, `/draft`, `/log`, `/snooze`, `/skip` |
| Gamification | `GET /gamification/dashboard` (relationship-fitness score, weekly streak, weekly goal, XP/level, achievements, encouragement — all computed on the fly from `reach_out_log` + cadence + tasks; no table). `GamificationController` → `GamificationService`. |
| Quiz | `POST /quiz/:id/answer`, `/skip`, `GET /quiz/history` |
| Duplicates | `GET /duplicates`, `/scan`, `/merge`, `/dismiss` |
| Voice | `POST /voice/capture` (multipart audio) |
| Social groups | CRUD + per-provider sync (Facebook groups, WhatsApp QR + groups) |
| Push | `POST/DELETE /push/register` |
| Google accounts | list / link / update / unlink |
| MCP server | `POST /mcp` (JSON-RPC: 7 read + 5 write w/ diff-then-confirm + 4 agentic/schedule = 16 tools), `GET/POST/DELETE /mcp/tokens` (per-user `mcp:read`/`mcp:write` Sanctum abilities). All tools scope to `auth()->user()`; cross-tenant access returns not-found. |
| Contact schedule | `GET /contact-schedule` (queryable timeline), `/contact-schedule/suggestions` ("in the mood to reach out"), `POST /contact-schedule/{id}/complete\|snooze\|dismiss\|draft`, `POST /contact-schedule/rebuild`. Built by `kontakti:rebuild-contact-schedule` (daily 06:30, all users) from `people.contact_cadence` (default `quarterly`) + birthday/holiday flags. Deep-dive: `Website/docs/contact-schedule.md`. |
| Apple contact links | `GET/POST /apple-contact-links`, `DELETE /apple-contact-links/{personId}` (opt-in iOS CN-identifier cloud backup) |

### Web SPA

LoginPage, RegisterPage, PeoplePage (with PersonDetailModal + AddPersonModal), CompaniesPage (with CompanyDetailModal + AddCompanyModal), DiscussionsPage (with DiscussionDetailModal + LogDiscussionModal), ActivityFeedPage, ProgressPage (gamification dashboard), GlobalSearch (⌘K palette), NoteEditor, KanbanBoard, VoiceCaptureFlow, PhotoGallery.

### iOS

Tabs: **Today / People / Companies / Discussions / Feed / Settings**.

| Area | Screens |
|---|---|
| Auth | LoginView, RegisterView, OnboardingView (4-step wizard) |
| People | PeopleListView, PersonDetailView, EditPersonView, PhotoGalleryView, ImportContactsView, LinkedInImportView, LinkSocialPickerView, **ReviewContactsView** |
| Apple Contacts | **AppleContactsWritebackSection** (diff-then-confirm push to CN), `AppleContactsWriter` service, local-only `AppleContactLinkEntity` SwiftData mapping |
| Companies | CompaniesListView, CompanyDetailView |
| Discussions | DiscussionsListView, DiscussionDetailView, LogDiscussionView |
| Today | TodayView, DraftMessageSheet, JobChangesView |
| Voice | VoiceRecordingView, VoiceResultReviewView |
| Quiz | QuizCarousel, QuizSessionView |
| Settings | SettingsView, DuplicateReviewView, SocialGroupsListView, GroupImportWizardView, QRPairingView, SyncDirectionPicker |
| Intents | KontaktiShortcutsProvider, LogVoiceMemoIntent |

**Offline:** SwiftData `@Model` cache + `OfflineStore` + `SyncQueue` actor + `NetworkMonitor` (NWPathMonitor).

### Android

Bottom nav: **Today / People / Companies / Discussions / Settings** (Activity feed accessible from Settings → Activity feed; not a tab because 6 tabs cramp the label widths).

| Area | Screens |
|---|---|
| Auth | LoginScreen (sign-in + sign-up + "Continue with Google"), OnboardingScreen (Welcome → Phone → Google → Done) |
| People | PeopleListScreen, PersonDetailScreen, PersonEditScreen, AddPersonScreen, **ReviewContactsScreen** |
| Companies | CompaniesListScreen, CompanyDetailScreen, AddCompanyScreen |
| Discussions | DiscussionsListScreen, DiscussionDetailScreen, LogDiscussionScreen |
| Today | TodayScreen, DraftMessageSheet, QuizSection |
| Feed | FeedScreen |
| Voice | VoiceRecorderScreen, VoiceResultReview |
| Imports | ImportContactsScreen, GmailImportScreen, LinkedInImportScreen |
| Settings | SettingsScreen (linked Google accounts, activity feed, import, social groups, duplicates, **review contacts**, notifications, sign out) |
| Other | DuplicatesScreen, GroupImportWizard, SocialGroupsScreen, QuizSessionScreen |

**Offline:** Room entities + `Flow` queries + repositories that serve cache first + `SyncWorker` (WorkManager) for queued mutations.

**Auth:** Bearer token is attached by the Hilt-provided `OkHttpClient` interceptor in `AppModule.provideOkHttp` (reads `tokenStore.tokenFlow.first()`). Bug fixed 2026-05-28: it was previously a no-op so every authenticated call silently failed.

**Google sign-in for login** uses `GoogleAuthManager.signInForIdToken` (id_token verified server-side by `/auth/google`). **Google for Gmail/Contacts import** uses `GoogleAuthManager.handleSignInResult` which now exchanges the signed-in `Account` via `GoogleAuthUtil.getToken` for a real OAuth access token.

---

## DB schema (key tables)

All tables have `user_id` (FK → `users.id`), `created_at`, `updated_at`. Soft deletes on tasks.

| Table | Important columns |
|---|---|
| users | id (UUID), name, username, email, password, has_completed_onboarding |
| people | first_name, last_name, email, phone, linkedin_url, avatar_url, company_id, title, relationship_strength (enum), last_contacted_at, next_followup_at, notes, do_not_contact, **needs_review, reviewed_at**, metadata (JSON; includes `import_source`, `import_warnings`, `google_account_id`) |
| companies | name, domain, logo_url, industry, size_range, linkedin_url, website, notes |
| discussions | title, date, type (enum: call/meeting/email/message/event/other), summary, body |
| discussion_people | pivot: discussion_id, person_id (+ timestamps) |
| notes | title, body, notable_type, notable_id (polymorphic), obsidian_path, synced_at |
| tasks | title, description, due_at, completed_at, priority (enum), taskable_type, taskable_id |
| tags | name, slug, color |
| taggables | tag_id, taggable_type, taggable_id |
| activity_feed | subject_type, subject_id, verb, object_type, object_id, payload (JSON) |
| entity_links | from_type, from_id, to_type, to_id, label |
| person_emails | person_id, value, label, is_primary |
| person_phones | person_id, value, label, is_primary |
| person_photos | person_id, url, source, is_primary, sort_order |
| user_google_accounts | id, user_id, google_sub, email, access_token, refresh_token, is_primary, label |
| duplicate_candidates | left_id, right_id, score, reason, status |
| push_tokens | user_id, token, platform, device_id |
| email_threads | gmail message metadata cache |
| social_groups + social_group_members | provider (facebook/whatsapp), provider_group_id, last_synced_at |
| social_activity | per-person provider feed |
| contact_prompts | quiz history (question_key, answered_at) |
| reach_out_log | per-Today-item dispatch record |

---

## Recent commits worth knowing about (2026-05-28 → 2026-05-29)

| Repo | Commit | What |
|---|---|---|
| kontakti-web | [e946c71](https://github.com/jasonhuber/kontakti-web/commit/e946c71) | `/people/health` endpoint + `needs_review`/`reviewed_at` fields + import-time review heuristics |
| kontakti-ios | [d35b3dd](https://github.com/jasonhuber/kontakti-ios/commit/d35b3dd) | Multi-account Google linking honesty + SwiftUI iOS-17 `onChange` syntax + draft error type fix |
| kontakti-ios | [6e971f4](https://github.com/jasonhuber/kontakti-ios/commit/6e971f4) | Contact Review queue UI |
| kontakti-ios | [f21b26d](https://github.com/jasonhuber/kontakti-ios/commit/f21b26d) | Drop deprecated `.onChange(of:perform:)` call sites across 7 files |
| kontakti-ios | [34a789d](https://github.com/jasonhuber/kontakti-ios/commit/34a789d) | Apple Contacts writeback with diff-then-confirm gate + local CN-identifier mapping |
| kontakti-android | [dbee0b3](https://github.com/jasonhuber/kontakti-android/commit/dbee0b3) | iOS parity: build fixes, auth gate, Companies/Discussions/Feed/photo gallery |
| kontakti-android | [27cdaf5](https://github.com/jasonhuber/kontakti-android/commit/27cdaf5) | AddCompany + LogDiscussion + Google sign-in button + tab polish |
| kontakti-android | [8711a32](https://github.com/jasonhuber/kontakti-android/commit/8711a32) | Onboarding wizard + import-payload shape fix |
| kontakti-android | [3339950](https://github.com/jasonhuber/kontakti-android/commit/3339950) | Smoke-test fixes: auth bootstrap combine, Google access token, FAB conflict, label wrap |
| kontakti-android | [5c416af](https://github.com/jasonhuber/kontakti-android/commit/5c416af) | Contact Review queue ported |

---

## Known caveats

- **Android Gmail import** was historically broken (returned `serverAuthCode` with no server-side exchange). Fixed 2026-05-29 in `GoogleAuthManager.handleSignInResult` to use `GoogleAuthUtil.getToken`. Untested against a real Google account on a real device — verify when convenient.
- **Apple Contacts writeback** never auto-merges. Every push goes through a diff-and-confirm sheet. Stale-link recovery: if the user deleted the linked Apple contact, the update flow surfaces the error and drops the local link.
- **iOS Apple Contact identifier mapping is strictly local-only** (separate SwiftData entity) — never synced to the backend, so re-installing iOS loses the links until the user re-links each person.
- **xcuserdata is currently tracked** in the iOS repo (legacy). The IDE-state files keep showing up as modified. Cosmetic; safe to ignore. The Android `KontaktiApp.xcodeproj/xcuserdata/` is similar.
- **iOS LinkedIn import** uses an embedded WKWebView so the user logs in via LinkedIn's normal mobile flow. Once logged in, subsequent enrichments are instant. HTML is POSTed to `enrich.kontakti.app/api/enrich` which runs phi4 locally and returns structured fields.
- **Onboarding gate:** AuthState routes to OnboardingScreen when neither `tokenStore.onboardedFlow` is true NOR `user.has_completed_onboarding` is true. Logout clears the local onboarded flag so a fresh account on the same device re-runs the wizard.

---

## Where to look for things

| Question | Answer |
|---|---|
| What's the next thing to ship? | `NEXT_STEPS.md` |
| Where do I add a new API endpoint? | `Website/backend/routes/api.php` + a controller method in `app/Http/Controllers/API/` |
| Where do I add an iOS screen? | `iOS/KontaktiApp/KontaktiApp/Views/<Domain>/<NewView>.swift`, then `xcodegen generate` |
| Where do I add an Android screen? | `Android/KontaktiAndroid/app/src/main/kotlin/com/kontakti/ui/screens/<domain>/<NewScreen>.kt` + a route in `MainActivity.kt` |
| Why won't the iOS app find an endpoint? | The backend probably needs `bash deploy.sh --backend-only` (auto-migrates) |
| Production logs? | `ssh -i ~/.ssh/id_ed25519_hostinger -p 65002 u675113980@88.223.85.36 'cd ~/domains/kontakti.app/backend && tail -n 200 storage/logs/laravel.log'` |
| Routes deployed? | `php artisan route:list --path=api` on the server, or curl `https://kontakti.app/api/v1/<path>` with `Accept: application/json` and check for `401` vs `404` |

---

## License

MIT across all three repos.
