# Kontakti — Web

Personal relationship intelligence. A CRM for one person, not a sales team.

**Live at [kontakti.app](https://kontakti.app)**

---

## What it is

Kontakti is an open source personal CRM. Track people, companies, discussions, notes, and tasks. No pipeline stages, no quota tracking, no seats. Just your contacts organized the way you think.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Laravel 12, PHP 8.2, Sanctum auth |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Database | MySQL |
| Auth | Laravel Sanctum (Bearer token) |

---

## Local dev

### Requirements

- PHP 8.2+
- Composer
- Node 20+
- MySQL 8

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env — set DB_*, APP_KEY
composer install
php artisan key:generate
php artisan migrate
php artisan serve          # → http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                # → http://localhost:5173
```

The Vite dev server proxies `/api/*` to `localhost:8000`.

---

## Self-hosting

### Requirements

- A server running PHP 8.2+ with `mod_rewrite`
- MySQL 8
- Composer
- Node 20+ (for the frontend build; not needed at runtime)

### Steps

1. **Clone the repo**
   ```bash
   git clone https://github.com/jasonhuber/kontakti-web.git
   ```

2. **Backend**
   ```bash
   cd kontakti-web/backend
   composer install --no-dev --optimize-autoloader
   cp .env.example .env
   # Set APP_KEY, DB_*, APP_URL
   php artisan key:generate
   php artisan migrate
   ```

3. **Frontend**
   ```bash
   cd kontakti-web/frontend
   npm install
   npm run build
   # Copy dist/ to your public_html/app/
   ```

4. **Web server**

   Point your web server root to `backend/public/` for the API and serve the built `dist/` from `/app/`.

   Example `.htaccess` for shared hosting:
   ```apache
   RewriteEngine On
   RewriteCond %{REQUEST_URI} ^/api/
   RewriteRule ^api/(.*)$ ../backend/public/index.php [L,QSA]
   RewriteCond %{REQUEST_URI} ^/app/
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule ^app/.*$ /app/index.html [L]
   ```

5. **Create your account**

   ```bash
   php artisan user:create
   ```

   Or hit `POST /api/v1/auth/register` with `{ name, username, email, password, password_confirmation }`.

---

## API reference

All endpoints require `Authorization: Bearer <token>` except login/register.

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login        → { token, user }
GET    /api/v1/auth/me
POST   /api/v1/auth/logout

GET    /api/v1/people            ?q=&relationship_strength=&page=
POST   /api/v1/people
GET    /api/v1/people/:id
PUT    /api/v1/people/:id
DELETE /api/v1/people/:id
GET    /api/v1/people/:id/timeline
GET    /api/v1/people/:id/discussions
GET    /api/v1/people/:id/tasks

GET    /api/v1/companies         ?q=&page=
POST   /api/v1/companies
GET    /api/v1/companies/:id
PUT    /api/v1/companies/:id
DELETE /api/v1/companies/:id
GET    /api/v1/companies/:id/people
GET    /api/v1/companies/:id/discussions

GET    /api/v1/discussions       ?q=&type=&page=
POST   /api/v1/discussions
GET    /api/v1/discussions/:id
POST   /api/v1/discussions/:id/participants/:personId
DELETE /api/v1/discussions/:id/participants/:personId

POST   /api/v1/contacts/import   { contacts: [...] } → { imported, skipped, people }

GET    /api/v1/feed
GET    /api/v1/search            ?q=
```

---

## Multi-tenancy

Single database, `user_id` on every table. All controllers scope to the authenticated user — each user sees only their own data.

---

## Deploy (Hostinger)

```bash
bash deploy.sh                # full deploy
bash deploy.sh --frontend-only
bash deploy.sh --backend-only
bash deploy.sh --marketing-only
```

---

## License

MIT
