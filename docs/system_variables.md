# System Variables Inventory

All environment variables required by the DigitoPub platform.

---

## Database (MySQL/MariaDB) — REQUIRED

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `DATABASE_URL` | Full MySQL connection string for Prisma | — | `prisma.config.ts`, `lib/db/init.ts` |
| `DATABASE_HOST` | Database server hostname | `localhost` | `lib/db/config.ts`, `lib/db/init.ts` |
| `DATABASE_PORT` | Database server port | `3306` | `lib/db/config.ts`, `lib/db/init.ts` |
| `DATABASE_NAME` | Database name | `scientific_journals_db` | `lib/db/config.ts`, `lib/db/init.ts` |
| `DATABASE_USER` | Database user | `root` | `lib/db/config.ts`, `lib/db/init.ts` |
| `DATABASE_PASSWORD` | Database password | `""` | `lib/db/config.ts`, `lib/db/init.ts` |

---

## Authentication — REQUIRED

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `JWT_SECRET` | Secret key for JWT signing/validation (min 64 chars recommended) | — | `lib/db/auth.ts`, `middleware.ts` |

---

## Application & Security — REQUIRED

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `NODE_ENV` | Node environment (`development` / `production`) | `development` | Multiple |
| `NEXT_PUBLIC_APP_URL` | Public-facing application URL | `http://localhost:3000` | `src/lib/rpc.ts` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | — | `src/server/app.ts` |
| `NOTIFY_TOKEN_SECRET` | HMAC secret for publication-alert confirm, manage and unsubscribe links. **Required in production**; rotating it invalidates every link already emailed | dev default with warning | `src/lib/env.ts` (`getNotifyEnv`), `src/lib/notification-token.ts` |

---

## OJS External Database — OPTIONAL

Only required if integrating with an Open Journal Systems instance. The pool is lazily initialized — if these are not set, OJS features return `{ configured: false }`.

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `OJS_DATABASE_HOST` | OJS database hostname | — | `src/features/ojs/server/ojs-client.ts` |
| `OJS_DATABASE_PORT` | OJS database port | `3306` | `src/features/ojs/server/ojs-client.ts` |
| `OJS_DATABASE_NAME` | OJS database name | — | `src/features/ojs/server/ojs-client.ts` |
| `OJS_DATABASE_USER` | OJS database user (read-only recommended) | — | `src/features/ojs/server/ojs-client.ts` |
| `OJS_DATABASE_PASSWORD` | OJS database password | `""` | `src/features/ojs/server/ojs-client.ts` |
| `OJS_SYNC_ENABLED` | Enable/disable OJS sync cron | `false` | Configuration only |
| `OJS_SYNC_INTERVAL_MINUTES` | Sync interval in minutes | `360` | Configuration only |

---

## File Uploads — OPTIONAL

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `MAX_FILE_SIZE_MB` | Maximum upload file size in MB | `50` | Upload handlers |
| `NOTIFY_IMPORT_MAX_ROWS` | Maximum data rows per uploaded notification subscriber list | `10000` | `src/features/notifications/server/config.ts` |
| `ALLOWED_FILE_TYPES` | Comma-separated allowed extensions | `pdf,doc,docx,txt,jpg,png` | Upload handlers |
| `UPLOAD_DIR` | Directory for file uploads | `./uploads` | Upload handlers |

---

## Seeding Credentials — REQUIRED (First Deploy)

Used by `lib/db/init.ts` during runtime database initialization to create privileged accounts.

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `ADMIN_EMAIL` | Super admin email address | — | `lib/db/init.ts` |
| `ADMIN_PASSWORD` | Super admin password | — | `lib/db/init.ts` |
| `SUPPORT_EMAIL` | Support user email address | — | `lib/db/init.ts` |
| `SUPPORT_PASSWORD` | Support user password | — | `lib/db/init.ts` |

---

## Runtime Initialization — REQUIRED

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `ALLOW_PROD_DB_INIT` | Set to `"true"` to enable auto migration + seeding on startup | `false` | `lib/db/init.ts` |
| `OTP_DELIVERY_METHOD` | OTP delivery: `"console"`, `"email"`, or `"disabled"` | `"disabled"` (prod) / `"console"` (dev) | `src/features/auth/server/route.ts` |
