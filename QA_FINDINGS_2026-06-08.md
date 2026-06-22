# QA findings & test plan — 2026-06-08 session

Self-contained test plan for issues raised on 2026-06-08, written for cold
execution on another machine. Complements the existing harness in
[QA.md](QA.md) and [docs/TEST_HARNESS_Web.md](../docs/TEST_HARNESS_Web.md).

**Status of this round:** T1–T8 have all been **implemented in code**. None have
been run/verified by the author (this machine has no node/php/mysql on PATH, and
the DB is remote). Your job on the QA machine is to deploy + verify each. Items
are marked **VERIFY** (logic is high-confidence, just confirm) or **UNVERIFIED**
(new integration, exercise carefully and report API/shape errors).

---

## Deploy first (required for the fixes to show up)

```bash
# Frontend
cd "Website/frontend" && npm install && npm run build   # or: npm run dev (:5173)

# Backend
cd "Website/backend"
php artisan migrate            # creates google_contact_links (T8)
php artisan storage:link       # serves re-hosted avatars at /storage (T4)
# Ensure APP_URL is the real public origin (prod: https://kontakti.app), else
# re-hosted avatar URLs will point at localhost.
```

**Run locations:**
- Local dev: `http://localhost:5173/app`
- Production: `https://kontakti.app/app?token=<QA_TOKEN>` (from `Website/.qa-token`)

For each test record PASS/FAIL, and on FAIL: Network method+path+status, the JS
console error, and a one-line repro. Don't paste the token into reports.

---

## T1 — Dark-mode note legibility · IMPLEMENTED · VERIFY

**Was:** typing a note showed white text on a white box.
**Fix:** dark-mode base rule for all form controls in
[frontend/src/index.css](frontend/src/index.css).

1. OS appearance → Dark.
2. Type in: Edit Person → Notes; Add Person → Notes; Edit Person → "How we met";
   Today → Draft; Log interaction → note box.
3. **PASS:** every field shows legible light text on a dark field.

---

## T2 — Avatar fallback on broken photo · IMPLEMENTED · VERIFY

**Fix:** avatars fall back to initials on image load error, in the People list
([frontend/src/components/PersonCard.tsx](frontend/src/components/PersonCard.tsx))
and the detail header (`HeaderAvatar` in
[frontend/src/pages/PersonDetailModal.tsx](frontend/src/pages/PersonDetailModal.tsx)).

1. Find/seed a contact whose photo currently 404/525s.
2. **PASS:** clean initials circle, no broken-image icon, in list and header.

---

## T3 — "Note added doesn't show on the card" · IMPLEMENTED (UX) · VERIFY

**Root cause (determined by code review, not a data bug):** Kontakti has three
separate note stores on a contact, and the reported note landed in a *different*
one than the tab being checked. Proof: the Notes-table store writes **nothing**
to the activity feed, yet the reported note *appeared* in Activity — so it was
saved as a **logged interaction** (which logs activity and shows under the
**Interactions** tab), not a Notes-tab note. The note wasn't lost; it was in
Interactions. The data path for Notes-tab notes is correct end-to-end
(`notable_type`/`notable_id` fillable, identical type strings, correct query).

**Fix (clarity, not data):**
- Notes-tab empty state now explains where each kind of note lives.
- The interaction note field is relabeled "Add a note about this interaction…".

**Test**
1. On a contact, **Log** an interaction with a note → it appears under
   **Interactions** + Activity, **not** the Notes tab. Confirm the Notes-tab
   empty state explains this.
2. On the **Notes** tab → New note → save → it appears in the Notes tab and is
   **not** in Activity (Notes-tab notes are intentionally not activity-logged).
3. Edit Person → Notes → save → shows under **Overview → About**.

**PASS:** each note type lands where the UI now says it does; no note is
unaccounted for. If a Notes-tab note still fails to appear after reload, capture
the `POST /notes` payload + the `GET /notes?...` response (that would indicate a
real persistence bug separate from this UX fix).

---

## T4 — LinkedIn photos 404/525 · IMPLEMENTED (re-host) · VERIFY + infra

**Root cause:** `avatar_url` stored the raw LinkedIn CDN (`licdn.com`) URL, which
expires → 404/525. The `525` specifically is a Cloudflare origin-SSL failure.
**Fix:** `rehostAvatar()` in
[backend/.../PeopleController.php](backend/app/Http/Controllers/API/PeopleController.php)
downloads the photo at enrich + backfill time and stores it on our public disk,
so `avatar_url` points at our own domain. Falls back to the original URL on any
download failure; the frontend (T2) then shows initials if even that 404s.

**Test**
1. Confirm `php artisan storage:link` was run and APP_URL is the public origin.
2. Enrich a new contact from a LinkedIn URL (or run **Backfill avatars** in
   Settings). Inspect the resulting `avatar_url` — it should be
   `https://<your-domain>/storage/avatars/<id>.jpg`, **not** a `licdn.com` URL.
3. Load that contact — photo renders from our domain (Network: 200 from our
   host).
4. For any *pre-existing* contact still pointing at `licdn.com`, re-run backfill
   to migrate it.

**PASS:** newly enriched/backfilled avatars are self-hosted and load 200.
**Still-open infra note:** if the enrichment proxy itself (`enrich.kontakti.app`)
returns 525, enrichment can't fetch the photo to re-host — capture that host's
TLS/cert state separately (`curl -vI https://enrich.kontakti.app`).

---

## T5 — Global Notes page: notes looked "lost" · IMPLEMENTED · VERIFY

**Fix:** the API now appends `notable_label`/`notable_kind` to each note
([backend/.../NotesController.php](backend/app/Http/Controllers/API/NotesController.php)),
and the global Notes list shows an attachment badge — "↳ Ken Pogancy" for linked
notes, "Unfiled" for standalone ones
([frontend/src/pages/NotesPage.tsx](frontend/src/pages/NotesPage.tsx)).

**Test**
1. Nav → **Notes**. Each row shows a badge: the contact/company name, or
   "Unfiled".
2. A note created on a contact's Notes tab shows here with that contact's name.
3. A note created via the global **New** button shows "Unfiled".

**PASS:** every note's attachment is visible; nothing appears to vanish.

---

## T6 — Three "notes" concepts on a contact · IMPLEMENTED (clarity) · VERIFY

Coordinated with T3. The three stores: **About** (`person.notes`, Overview),
**Notes tab** (`notes` table), **interaction notes** (Interactions tab). Labels
+ the Notes empty-state now make the distinction explicit.

**Test:** add text in each of the three places; confirm each shows only in its
own surface, and the Notes empty-state text correctly describes the other two.

> Future option (not done): unify into one notes concept. Left as a product
> decision — current change is clarity only, no data migration.

---

## T7 — Duplicate merge orphaned Apple links & photos · IMPLEMENTED · VERIFY

**Was:** `DuplicateDetector::mergeCandidate` reassigned phones/emails/notes/
tasks/pivots/links/activity to the survivor, but **not** `apple_contact_links`
or `person_photos` — so after a merge the Apple writeback link and the loser's
photos were orphaned.
**Fix:** merge now carries `person_photos` and `apple_contact_links` (deduped
against the survivor) to the primary, and normalises photo `is_primary` so only
one stays primary
([backend/app/Services/DuplicateDetector.php](backend/app/Services/DuplicateDetector.php)).

**Test**
1. Create two duplicate contacts where the **non-primary** one has an Apple link
   (iOS) and/or a photo the primary lacks.
2. Merge them (keep the other as primary).
3. **PASS:** survivor retains exactly one Apple link and all distinct photos,
   with a single primary photo. No orphaned rows on the soft-deleted person.

---

## T8 — Google Contacts write-back · IMPLEMENTED · UNVERIFIED

**New feature** mirroring Apple writeback. Pushes a person's current fields to
Google Contacts via the People API.

New pieces:
- migration `google_contact_links` (resource_name + etag per person)
- model `GoogleContactLink`
- service `GoogleContactsWriter` (create/update via People API, etag-safe)
- controller `GoogleContactLinksController` + routes:
  - `POST /api/v1/people/{person}/google-contact-push`
  - `GET /api/v1/google-contact-links`
  - `DELETE /api/v1/google-contact-links/{personId}`
- web trigger: **Push to Google Contacts** button in the contact Overview → Sync.

**Hard dependency — OAuth scope.** The linked Google account must be consented
with `https://www.googleapis.com/auth/contacts`. The current Google connect flow
is Gmail-read scoped, so **you will likely need to re-connect Google with the
contacts scope added** before a push succeeds. Without it the People API returns
403 and the UI shows: "Re-connect your Google account and grant Contacts
permission."

**Test (do this carefully and report exact API errors — code is unverified)**
1. Ensure a Google account is linked (Settings) with the contacts scope.
2. Open a contact → Overview → **Push to Google Contacts**.
   - Success → green "Pushed to Google Contacts (email)"; verify the contact
     appears/updates in `contacts.google.com`. Confirm `google_contact_links`
     has a row with a `resource_name` + `etag`.
   - Edit the contact in Kontakti, push again → the Google contact updates
     (no duplicate created — etag/update path).
3. If you get 403 → scope is missing; re-consent and retry.
4. Report any non-403 People API errors verbatim (field-shape/contract bugs are
   the most likely defect in this unverified code).

**Known gaps (intentionally not built):** Android trigger (web + future iOS
only for now); Gmail→device diff (still stubbed in `SyncDirectionPicker`);
two-way conflict UI beyond etag re-fetch.

---

## Summary

| # | Item | Status | Where |
|---|---|---|---|
| T1 | Dark-mode note legibility | IMPLEMENTED · verify | Local build |
| T2 | Avatar fallback on broken photo | IMPLEMENTED · verify | Local build |
| T3 | Note "missing" from card (multi-store) | IMPLEMENTED (UX) · verify | Either |
| T4 | LinkedIn photo 404/525 (re-host) | IMPLEMENTED · verify | Backend deploy |
| T5 | Global Notes attachment visibility | IMPLEMENTED · verify | Either |
| T6 | Three note concepts (clarity) | IMPLEMENTED · verify | Either |
| T7 | Merge orphaned Apple links/photos | IMPLEMENTED · verify | Backend + iOS |
| T8 | Google Contacts write-back | IMPLEMENTED · UNVERIFIED | Backend + web + OAuth scope |

**Migrations/ops introduced:** `google_contact_links` table (run `migrate`);
`storage:link` + correct `APP_URL` for re-hosted avatars; Google OAuth contacts
scope for T8.
