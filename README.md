# Kontakti — Web (API + SPA)

Personal relationship intelligence. A CRM for one person, not a sales team. **Live at [kontakti.app](https://kontakti.app)**.

This repo is the backend + web SPA. The native apps live at [`kontakti-ios`](https://github.com/jasonhuber/kontakti-ios) and [`kontakti-android`](https://github.com/jasonhuber/kontakti-android).

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Laravel 12, PHP 8.3, Sanctum auth |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Database | MySQL 8 |
| Hosting | Hostinger shared PHP (Unix socket to MySQL — TCP is blocked from the server) |
| Deploy | `deploy.sh` (ssh+rsync) |

---

## Local dev

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env — set DB_*, APP_KEY
composer install
php artisan key:generate
php artisan migrate
php artisan serve            # → http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                  # → http://localhost:5173 (proxies /api/* to :8000)
```

---

## Self-hosting

1. **Clone:**
   ```bash
   git clone https://github.com/jasonhuber/kontakti-web.git
   ```
2. **Backend:**
   ```bash
   cd kontakti-web/backend
   composer install --no-dev --optimize-autoloader
   cp .env.example .env
   # Set APP_KEY, DB_*, APP_URL, GOOGLE_WEB_CLIENT_ID (optional but recommended)
   php artisan key:generate
   php artisan migrate
   ```
3. **Frontend:**
   ```bash
   cd kontakti-web/frontend
   npm install
   npm run build
   # Copy dist/ to your public_html/app/
   ```
4. **Web server:** point at `backend/public/` for the API and serve the built `dist/` at `/app/`. Sample `.htaccess` (LiteSpeed / Apache shared hosting):
   ```apache
   RewriteEngine On
   RewriteCond %{REQUEST_URI} ^/api/
   RewriteRule ^api/(.*)$ ../backend/public/index.php [L,QSA]
   RewriteCond %{REQUEST_URI} ^/app/
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule ^app/.*$ /app/index.html [L]
   ```
5. **Create your account:** `php artisan user:create` or `POST /api/v1/auth/register` with `{ name, username, email, password, password_confirmation }`.

---

## API reference

All endpoints require `Authorization: Bearer <token>` except register, password login, and Google login. All responses are JSON; pass `Accept: application/json` to force the JSON renderer even on errors.

### Auth

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login              → { token, user }
POST   /api/v1/auth/google              { id_token } → { token, user }
GET    /api/v1/auth/me
POST   /api/v1/auth/logout
POST   /api/v1/auth/onboarding/complete → UserProfile
```

### People

```
GET    /api/v1/people                  ?q=&relationship_strength=&needs_review=1&page=
POST   /api/v1/people
GET    /api/v1/people/health           → { total, buckets: { key: { count, samples } } }
POST   /api/v1/people/{id}/review      → marks reviewed_at, clears needs_review
GET    /api/v1/people/{id}
PUT    /api/v1/people/{id}
DELETE /api/v1/people/{id}
GET    /api/v1/people/{id}/timeline
GET    /api/v1/people/{id}/discussions
GET    /api/v1/people/{id}/tasks
GET    /api/v1/people/{id}/notes
GET    /api/v1/people/{id}/activity
POST   /api/v1/people/{id}/activity/refresh
GET    /api/v1/people/{id}/photos
POST   /api/v1/people/{id}/photos      (multipart or JSON data-URL)
DELETE /api/v1/people/{id}/photos/{photoId}
POST   /api/v1/people/{id}/photos/{photoId}/primary
POST   /api/v1/people/enrich
```

### Companies

```
GET    /api/v1/companies               ?q=&page=
POST   /api/v1/companies
GET    /api/v1/companies/{id}
PUT    /api/v1/companies/{id}
DELETE /api/v1/companies/{id}
GET    /api/v1/companies/{id}/people
GET    /api/v1/companies/{id}/discussions
```

### Discussions

```
GET    /api/v1/discussions             ?q=&type=&page=
POST   /api/v1/discussions
GET    /api/v1/discussions/{id}
POST   /api/v1/discussions/{id}/participants/{personId}
DELETE /api/v1/discussions/{id}/participants/{personId}
```

### Contact import (used by both mobile apps)

```
POST   /api/v1/contacts/import
       { contacts: [{ first_name, last_name, email?, phone?, company_name?, source?, … }] }
       → { imported, skipped, people, duplicates_detected, auto_merged }
```

The backend tolerates blank `first_name` / `last_name`, normalizes obvious-bad emails to null, and skips unusable rows individually rather than failing the batch. Rows that trip review heuristics (missing last name, no email AND no phone, invalid email shape, company name without a linkable Company) are saved with `needs_review = true` and `metadata.import_warnings = [...]`.

### Contact schedule (precomputed reach-out timeline)

```
GET    /api/v1/contact-schedule              ?window=180&status=pending&reason=
GET    /api/v1/contact-schedule/suggestions  ?limit=5   ("who should I reach out to?")
POST   /api/v1/contact-schedule/rebuild
POST   /api/v1/contact-schedule/{id}/complete
POST   /api/v1/contact-schedule/{id}/snooze  { days }
POST   /api/v1/contact-schedule/{id}/dismiss
POST   /api/v1/contact-schedule/{id}/draft
```

Per-person cadence lives on `people.contact_cadence` (+ `contact_on_birthday`,
`contact_on_holidays`); the timeline is materialized daily by
`kontakti:rebuild-contact-schedule`. Full design: [`docs/contact-schedule.md`](./docs/contact-schedule.md).

### MCP server (LLM access)

```
POST   /api/v1/mcp                     JSON-RPC 2.0 (16 tools; bearer token w/ mcp:read / mcp:write)
GET    /api/v1/mcp/tokens
POST   /api/v1/mcp/tokens              { name?, read_only? }
DELETE /api/v1/mcp/tokens/{id}
```

Plug Kontakti into Claude Desktop / Claude Code / Cursor. Write tools use a
diff-then-confirm protocol. Full doc + client config: [`docs/mcp.md`](./docs/mcp.md).

### Apple Contact links (opt-in iOS backup)

```
GET    /api/v1/apple-contact-links
POST   /api/v1/apple-contact-links     { links: [{ person_id, cn_contact_identifier, device_label? }] }
DELETE /api/v1/apple-contact-links/{personId}
```

### Other

```
GET    /api/v1/feed
GET    /api/v1/search                  ?q=
POST   /api/v1/search/natural          { query }
GET    /api/v1/today                   ?limit=
POST   /api/v1/today/items/{key}/draft
POST   /api/v1/today/items/{key}/log
POST   /api/v1/today/items/{key}/snooze
POST   /api/v1/today/items/{key}/skip
GET    /api/v1/duplicates              ?status=pending
POST   /api/v1/duplicates/scan
POST   /api/v1/duplicates/{id}/merge
POST   /api/v1/duplicates/{id}/dismiss
GET    /api/v1/quiz/history
POST   /api/v1/quiz/{id}/answer
POST   /api/v1/quiz/{id}/skip
POST   /api/v1/voice/capture           (multipart audio)
GET    /api/v1/google-accounts
POST   /api/v1/google-accounts/link
PATCH  /api/v1/google-accounts/{id}
DELETE /api/v1/google-accounts/{id}
POST   /api/v1/push/register
DELETE /api/v1/push/register
```

---

## Multi-tenancy

Single database, `user_id` on every table. All controllers scope to the authenticated user — each user sees only their own data. Path-based: everyone hits `kontakti.app/app` and the SPA discriminates per-token. Subdomain routing (`jason.kontakti.app`) is a future option that needs wildcard DNS + Laravel routing.

---

## Deploy

```bash
bash deploy.sh                # full deploy (marketing + SPA + backend)
bash deploy.sh --frontend-only
bash deploy.sh --backend-only # also runs composer install + migrate
bash deploy.sh --marketing-only
```

The backend deploy SSHes to Hostinger, rsyncs the PHP source, runs `composer install`, caches config/routes/views, runs `artisan migrate --force`, and ensures the photos symlink is in place. SSH key: `~/.ssh/id_ed25519_hostinger`.

`hPanel gotcha:` MySQL passwords containing `!`, `&`, `*` are silently truncated when set via the hPanel UI. Use alphanumeric-only.

---

## Project-level docs

Architecture, build environments, repo layout, recent commits: see [`HANDOFF.md`](./HANDOFF.md).

What's planned next: [`NEXT_STEPS.md`](./NEXT_STEPS.md).

Per-commit history: [`CHANGELOG.md`](./CHANGELOG.md).

Feature deep-dives:
- [`docs/mcp.md`](./docs/mcp.md) — MCP server (LLM access): tools, tokens, client config.
- [`docs/contact-schedule.md`](./docs/contact-schedule.md) — contact cadence + the precomputed reach-out timeline.

---

## License

MIT.
