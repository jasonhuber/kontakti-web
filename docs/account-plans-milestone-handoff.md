# Account Plans Milestone Handoff

Date: 2026-09-03

## Workspace note

Original Dropbox workspace became unavailable after Dropbox was stopped:

`/Users/jason/Library/CloudStorage/Dropbox/Personal/Sustav Dev/Kontakti`

Several selective-sync conflict stubs appeared, but they only contained partial placeholder files. Work continued in a fresh clone of the canonical web repo:

`/Users/jason/.codex/workspaces/Kontakti/kontakti-web`

Remote:

`git@github.com:jasonhuber/kontakti-web.git`

The Dropbox workspace reappeared on 2026-09-15, but many files were still
cloud-only placeholders. The recovered clone remains the safe integration
workspace. Work was rebased onto current `origin/main` and moved to branch
`codex/account-plan-stabilize`.

## Milestone reached

Implemented the first account-plan slice for the web app:

- First-class `account_plans` table.
- First-class `account_plan_items` table.
- `AccountPlan` and `AccountPlanItem` Eloquent models.
- Company-scoped account-plan API.
- Editable account-plan sections.
- Editable structured plan items.
- AI-style command preview/apply endpoints.
- Company detail drawer now has an `Account plan` tab.
- Frontend command box accepts free text or bullets, previews proposed operations, lets the user edit/select them, then applies selected operations.
- Disposable API lifecycle harness now covers account-plan create/load, update, item CRUD, preview, and apply.
- Applying a batch is transactional, so a later validation failure rolls back earlier operations.
- Preview operations carry idempotency keys, so retrying a successful apply does not duplicate plan items or linked tasks.

## Changed files

- `backend/database/migrations/2026_09_03_000001_create_account_plans_table.php`
- `backend/database/migrations/2026_09_03_000002_create_account_plan_items_table.php`
- `backend/app/Models/AccountPlan.php`
- `backend/app/Models/AccountPlanItem.php`
- `backend/app/Http/Controllers/API/AccountPlansController.php`
- `backend/routes/api.php`
- `frontend/src/lib/api.ts`
- `frontend/src/pages/AccountPlanTab.tsx`
- `frontend/src/pages/CompanyDetailModal.tsx`
- `qa/lifecycle.py`

## API shape

Routes added under `/api/v1`:

- `GET /companies/{company}/account-plan`
- `PATCH /account-plans/{accountPlan}`
- `POST /account-plans/{accountPlan}/items`
- `PATCH /account-plan-items/{item}`
- `DELETE /account-plan-items/{item}`
- `POST /account-plans/{accountPlan}/ai/preview`
- `POST /account-plans/{accountPlan}/ai/apply`

All routes are authenticated with Sanctum and explicitly scoped to the authenticated user. Person/task references are validated to belong to the same user before writes.

## Current AI behavior

The command box is intentionally deterministic for this milestone:

- Splits pasted lines into proposed plan items.
- `Enter five items` generates five starter items.
- Infers item type from words like risk, blocker, clarify, confirm, milestone, launch, stakeholder, champion, buyer.
- Infers priority from words like urgent, critical, budget, timeline, later.
- Infers due dates from simple phrases: today, tomorrow, next week, 30 days, next month.
- Matches company people by first name, last name, or full name.
- Returns a preview diff; nothing is applied until the user confirms selected operations.

This gives the UI a safe, useful surface now and leaves room for an LLM-backed planner later.

## Verified

From `/Users/jason/.codex/workspaces/Kontakti/kontakti-web`:

```bash
php -l backend/app/Http/Controllers/API/AccountPlansController.php
php -l backend/app/Models/AccountPlan.php
php -l backend/app/Models/AccountPlanItem.php
php -l backend/routes/api.php
python3 -m py_compile qa/lifecycle.py
```

From `/Users/jason/.codex/workspaces/Kontakti/kontakti-web/frontend`:

```bash
npm install
npm run build
```

Result: frontend TypeScript and Vite build passed. Re-verification on
2026-09-15 incorporated upstream lazy loading and emitted feature-level chunks
instead of the prior single 900+ kB bundle.

## Not verified

The cloned web repo does not include a Laravel root `artisan` file, so these were not run locally:

- `php artisan migrate`
- `php artisan route:list`
- `php artisan test`

Before deployment, run those commands from the complete Laravel app checkout or production deployment environment.

## Test plan for next LLM

Backend local/preview environment:

1. Run `php artisan migrate`.
2. Run `php artisan route:list | grep -E 'account-plan|account-plans'`.
3. Register or use a disposable user.
4. Create a company.
5. Create a person attached to that company.
6. `GET /api/v1/companies/{company}/account-plan` should create and return one plan.
7. Call it again and confirm it returns the same plan, not a duplicate.
8. `PATCH /api/v1/account-plans/{id}` with `objective`, `summary`, and `status`.
9. `POST /api/v1/account-plans/{id}/items` with a linked `person_id`.
10. `PATCH /api/v1/account-plan-items/{id}` to change `status`, `priority`, and `due_at`.
11. `POST /api/v1/account-plans/{id}/ai/preview` with `Enter five items`; expect at least five `create_plan_item` operations.
12. `POST /api/v1/account-plans/{id}/ai/apply` with two preview operations; expect two new items.
13. Try reading/updating another user's plan/item; expect 403 or 404/422.
14. Run `python3 qa/lifecycle.py --base <target>` after deploying the new backend.

Frontend manual QA:

1. Run the app and open Companies.
2. Open a company detail drawer.
3. Confirm the drawer has Overview, Account plan, and Notes tabs.
4. Open Account plan.
5. Edit title, status, objective, and summary; blur fields and refresh the drawer; confirm persistence.
6. Add a next step manually.
7. Change its type, status, priority, and due date.
8. Delete an item.
9. Paste five bullets in the command box and click Preview.
10. Edit one preview title, change type/priority/date, uncheck one operation, apply selected.
11. Confirm only selected operations become plan items.
12. Confirm AI-generated items show confidence/source badge.
13. Check mobile-width drawer layout for overflow.

## Next implementation steps

1. Run migrations, route inspection, and lifecycle QA in a complete Laravel runtime.
2. Deploy the stabilized web milestone only after those checks pass.
3. Replace deterministic preview generation with an LLM-backed planner service that hydrates trusted context from the backend: company, people, notes, discussions, tasks, contact schedule, recent activity.
4. Keep the same preview/apply response contract so the frontend does not need a rewrite.
5. Add richer stakeholder mapping with roles, influence, sentiment, and next action.
6. Add source citations from notes/discussions/tasks on preview operations.
7. Port read-only plan visibility to iOS and Android after the web flow is stable.
8. Add proper Laravel feature tests once the full backend scaffold is available.
