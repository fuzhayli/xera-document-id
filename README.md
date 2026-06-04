# XERA Document ID System

Node.js document ID, part list and revision workflow app for XERA.

## Cloud Runtime

- Web service: Render
- Database: Turso/libSQL
- Start command: `npm start`
- Health check: `/api/health`

## Required Environment Variables

```text
NODE_VERSION=24
NODE_ENV=production
DISABLE_PUBLIC_SIGNUP=false
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...
```

For an empty production database, set `INITIAL_ADMIN_PASSWORD` once to create
the first admin account. Existing admin passwords are not overwritten.

Never commit `.env`, Turso tokens, or `*.local.txt` credential notes.
