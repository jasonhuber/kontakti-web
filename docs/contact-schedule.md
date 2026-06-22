# Contact cadence & the reach-out schedule

Kontakti lets you say *how often* you want to stay in touch with each person, then
builds a **precomputed, queryable timeline** of when to reach out — so reminders
and "who should I contact?" suggestions are instant and consistent, never
recomputed on every request.

Two pieces:

1. **Cadence preference** on each person (`contact_cadence` + birthday/holiday flags).
2. **`contact_schedule`** — a materialized table of upcoming reach-out dates,
   rebuilt daily by a scheduled command, ~6 months out.

---

## Cadence model

Columns on `people`:

| Column | Type | Default | Meaning |
|---|---|---|---|
| `contact_cadence` | enum `none / monthly / quarterly / biannual / annual` | `quarterly` | how often to check in |
| `contact_on_birthday` | bool | `true` | remind on their birthday (only fires if a birthday is known) |
| `contact_on_holidays` | bool | `false` | remind around major holidays |

Interval lengths used by the builder: monthly = 30d, quarterly = 91d,
biannual = 182d, annual = 365d. `none` disables interval reminders (birthday /
holiday flags still apply).

**Where it's captured:**

- **The "do you know this person?" quiz** — a `contact_cadence` question ("How
  often do you want to stay in touch with {name}?") with chips: Monthly / Every 3
  months / Twice a year / Once a year / Only on birthday / Don't remind me. Renders
  on web, iOS, and Android automatically (the quiz is data-driven). Captured state
  is flagged in `metadata.cadence_set` so the quiz stops asking once answered.
- **Person edit screens** — a "Stay in touch" section (cadence picker + birthday /
  holiday toggles) on web (`EditPersonModal`), iOS (`EditPersonView`), and Android
  (`PersonEditScreen`). Saving on web triggers an immediate schedule rebuild.

---

## The schedule table

`contact_schedule` (model `ContactScheduleItem`):

| Column | Notes |
|---|---|
| `user_id`, `person_id` | scoped per user; FK cascade-delete |
| `due_at` | the date to reach out (date, not datetime) |
| `reason` | `cadence` / `birthday` / `holiday` |
| `label` | e.g. "Quarterly check-in", "Birthday", "Christmas" |
| `status` | `pending` / `done` / `snoozed` / `dismissed` |
| `snoozed_until` | date; `due()` scope ignores still-snoozed rows |

Unique on `(person_id, reason, due_at)` so the builder upserts idempotently;
indexed on `(user_id, status, due_at)` for the common query.

---

## How the timeline is built (deterministic)

`App\Services\ContactScheduleBuilder::rebuildForUser($user)`:

For each non-do-not-contact person, it generates entries within a 6-month horizon:

- **Cadence:** `next_due = (last_contacted_at ?? now) + interval`. The date is **not
  rolled forward** when it lands in the past — if you're overdue, `due_at` stays in
  the past so the person surfaces as overdue. A brand-new contact (no contact on
  record) anchors at `now`, so their first check-in is one interval out, not
  immediately overdue.
- **Birthday:** next birthday within the horizon, if `contact_on_birthday` and a
  `birthday` is known.
- **Holidays:** if `contact_on_holidays` — next occurrence of New Year's,
  Independence Day, Thanksgiving (computed), and Christmas within the horizon.

**Self-healing:** before generating, any pending rows whose `due_at` is on/before
the person's `last_contacted_at` are auto-marked `done` (you already reached out).
Obsolete future pending rows (cadence changed, birthday cleared) are pruned. Rows
the user acted on (`done` / `snoozed` / `dismissed`) are never resurrected.

This is the **deterministic** layer. An LLM only *polishes* the suggestions
(prioritization / phrasing); it never decides the dates.

---

## When it runs

Registered in `bootstrap/app.php`:

```
kontakti:rebuild-contact-schedule   daily 06:30   (all users)
kontakti:nightly-sync               daily 07:00   (Gmail-linked users only)
```

The rebuild runs for **every** user, independent of the Gmail-gated nightly sync.

> **Cron requirement:** these only fire if a system cron runs `php artisan
> schedule:run` every minute. On Hostinger that's configured in **hPanel → Cron
> Jobs**, not the CLI (the SSH user has no `crontab`). Run a build by hand with
> `php artisan kontakti:rebuild-contact-schedule`.

---

## API

All scoped to the authenticated user.

```
GET    /api/v1/contact-schedule              ?window=180&status=pending&reason=cadence
GET    /api/v1/contact-schedule/suggestions  ?limit=5
POST   /api/v1/contact-schedule/rebuild      → rebuild now for the current user
POST   /api/v1/contact-schedule/{id}/complete
POST   /api/v1/contact-schedule/{id}/snooze  { days }   (default 7)
POST   /api/v1/contact-schedule/{id}/dismiss
POST   /api/v1/contact-schedule/{id}/draft   → a drafted check-in message (text only)
```

- **`/contact-schedule`** — the queryable timeline: pending items in date order,
  with the person (and company) eager-loaded.
- **`/contact-schedule/suggestions`** — *"I'm in the mood to reach out."* A small
  ranked set of people **due now or overdue** (one per person, do-not-contact
  excluded). Each suggestion includes a `why` ("You usually connect every 3 months
  — it's been 140 days, 49 days past your target"), a `channel_hint`, `days_since` /
  `overdue_days`, and contact handles for one-tap outreach.
- **`/{id}/draft`** — generates a check-in message via `MessageDrafter` (same engine
  as the Today inbox); returns text only, never sends.

---

## MCP

Two MCP tools read this schedule (see [mcp.md](./mcp.md)):

- `who_should_i_reconnect_with` — people due now, from the stored timeline.
- `upcoming_contact_schedule` — forward look (default 60 days).

---

## Clients

- **Web** — an "In the mood to reach out?" panel on the Today page reads
  `/suggestions` (Done / Later actions). Cadence is editable in the person modal.
- **iOS / Android** — cadence + birthday/holiday capture in the person edit screen
  and the quiz. The Today inbox already surfaces `cadence_overdue`.
