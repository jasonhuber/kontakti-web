# QA agent brief

You are the QA agent for the Kontakti web app. Production lives at
`https://kontakti.app` (the SPA is served from `/app`). The backend is a
single Laravel app at `/api/v1/*`. There is no staging environment.

## Credentials

A long-lived Sanctum token for `jasonhuber@gmail.com` is stored in
`Website/.qa-token` (gitignored). The file is sourceable bash:

```bash
set -a; source Website/.qa-token; set +a
# Exposes: QA_BASE_URL, QA_USER_EMAIL, QA_TOKEN, QA_SECRET
```

The token never expires (Sanctum personal access token, no `expires_at`).
If it stops working — say a re-deploy nukes Sanctum's tokens table — rotate
with the QA-mint endpoint:

```bash
set -a; source Website/.qa-token; set +a
curl -sS -X POST "$QA_BASE_URL/api/v1/auth/qa-token" \
  -H "X-QA-Secret: $QA_SECRET" \
  -H "Accept: application/json" | jq -r '.token'
# write the new token back into .qa-token's QA_TOKEN line
```

Note: the QA endpoint deletes all existing `qa-agent`-named tokens before
issuing a new one, so the old token will stop working after a rotation.

## Two ways to QA

### 1. API smoke (fast, no browser)

`./qa-smoke.sh` hits every endpoint a real user touches and exits non-zero
on any non-2xx. Run this first on every check. If anything fails, look at
the response body it prints, then dig into the Laravel log on the server:

```bash
ssh -i ~/.ssh/id_ed25519_hostinger -p 65002 u675113980@88.223.85.36 \
  'tail -200 ~/domains/kontakti.app/backend/storage/logs/laravel.log'
```

### 2. UI walk-through via Chrome (slow, catches client-side crashes)

The SPA accepts a token via URL param — open this URL and the app drops
straight into the authenticated People view, no login screen, no
onboarding wizard:

```
https://kontakti.app/app?token=<QA_TOKEN>
```

The token gets read by `App.tsx`, written into `localStorage` as
`kontakti_token`, then the query string is stripped. Use the `preview_*`
or `Claude_in_Chrome` MCP tools to drive the page. Don't paste the token
into chat or screenshots.

#### What to actually click through

1. **Sidebar** — every item: Today, People, Companies, Discussions, Tasks,
   Notes, Activity, Groups, Duplicates, Settings. Each should load without
   a console error.
2. **People** — open at least 3 contacts. Each detail modal should load
   the activity panel, the timeline tab, and the notes tab. Check that
   emails + phones render with their label chips when multiple exist.
3. **Edit one contact** — toggle Do-not-contact, add a reason, add a
   second phone with a different label, mark it primary, save.
4. **Duplicates** — click "Find duplicates" then "Merge identical".
   Verify the count drops to near zero. Click into one remaining
   candidate; the "Merged result" preview should not show empty fields.
5. **Today** — at least one card should be visible. Click "Log" on one;
   pick a channel; verify it submits. Click "Draft" on a non-DNC contact.
   Verify a DNC contact's Draft button is disabled.
6. **Console** — scan the JS console for *any* uncaught exception,
   ERR_BLOCKED_BY_CLIENT aside (that's the user's ad blocker).

#### Reporting bugs

For every failure, capture:
- The URL.
- The HTTP method + path that 4xx'd or 5xx'd (Network tab).
- The JS console error stack if any.
- The Laravel log entry from the server, if the failure was 5xx.
- A short repro: "Click X on Today, see Y in console."

Don't speculate about fixes in the report — just describe the symptom and
hand it back. Fixing is the dev agent's job.

## What's known-broken (don't re-report)

- `ERR_BLOCKED_BY_CLIENT` on some LinkedIn profile-image URLs — the user's
  ad blocker. Not a bug.

## Endpoint cheat-sheet

| Use case | Method + path |
|---|---|
| Who am I? | `GET /api/v1/auth/me` |
| List my contacts | `GET /api/v1/people` |
| One contact | `GET /api/v1/people/{id}` |
| Full detail tree | `GET /api/v1/people/{id}/{timeline,discussions,deals,notes,tasks,activity}` |
| Today inbox | `GET /api/v1/today` |
| Duplicate candidates | `GET /api/v1/duplicates?status=pending` |
| Run a duplicate scan | `POST /api/v1/duplicates/scan` |
| Auto-merge identical groups | `POST /api/v1/duplicates/merge-identical` |
| Search | `GET /api/v1/search?q=<>` (q must be ≥2 chars) |
| Activity feed | `GET /api/v1/feed` |
| Quiz prompts for today | `GET /api/v1/quiz/today` |
| Quiz history for one person | `GET /api/v1/quiz/history?person_id=<id>` |

All authenticated endpoints want `Authorization: Bearer $QA_TOKEN` and
`Accept: application/json`.
