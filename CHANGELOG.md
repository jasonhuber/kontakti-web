# Changelog — kontakti-web

Notable changes to the backend + web SPA. Most recent at top.

The repo is small enough that this isn't an automated changelog — it's a curated narrative of what shipped and why.

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
