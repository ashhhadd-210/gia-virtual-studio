# GIA Backend — DigitalOcean App Platform Deployment Guide

This is the FastAPI backend for the GIA platform. It serves all REST endpoints
consumed by the frontend (auth, showroom GLB catalog, voting, collections,
GSNowGPT chat, blog, dashboard, proxy voting, Stripe).

## Prerequisites

1. A **Supabase project** with Postgres + Storage configured. The Postgres
   pooler URL is your `POSTGRESQL_URI`. (Recommended: `aws-1-*.pooler.supabase.com:6543`)
2. An **OpenAI API key** with access to `gpt-4o-mini`.
3. A **Gmail account with an App Password** for OTP signup emails. Enable 2FA on
   the Gmail account first, then create the App Password at
   <https://myaccount.google.com/apppasswords>.
4. A **DigitalOcean account** with App Platform access.

## Quick deploy (DigitalOcean App Platform)

1. Push this repository to GitHub (already done if you're reading this here).
2. In the DigitalOcean dashboard: **Create App** → connect this GitHub repo.
3. DigitalOcean auto-detects the Procfile and uses:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. In **App → Settings → Environment Variables**, paste every variable from
   [.env.example](./.env.example), filling in real values. **All variables
   marked REQUIRED are mandatory.** OTP signup will silently fail without
   `GMAIL_SENDER_EMAIL` and `GMAIL_APP_PASSWORD`.
5. Deploy. First boot creates all 25 Postgres tables via `CREATE TABLE IF NOT
   EXISTS` — no migrations to run.
6. Verify with `GET https://your-app.ondigitalocean.app/health` → should
   return `{"status":"ok","db":"connected"}`.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate   # Windows:  .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then fill in values
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Optional: design-engine worker

If you need the AI design generation pipeline (Stability AI → 3D → Supabase
Storage), install the extra deps on a separate worker:

```bash
pip install -r requirements-design.txt
playwright install chromium
```

The user-facing web service does not need `requirements-design.txt`. Splitting
keeps the production image ~400 MB lighter and the cold start ~30 s faster.

## Critical configuration notes

- **`ALLOWED_ORIGINS`** must include the exact production frontend URL with
  protocol, no trailing slash. The browser will reject CORS otherwise.
- **`POSTGRESQL_URI`** should use the **pooler** endpoint (port 6543), not the
  direct connection (port 5432). The pooler reuses connections across cold
  starts — direct connections exhaust the Supabase connection limit fast.
- **`JWT_SECRET`** must be set persistently. If left unset, the backend
  generates a random one on boot — fine in dev, but rotates user sessions
  on every redeploy in production.
- **`GPT_FREE_DAILY_LIMIT`** is set to 30 per spec. Adjust if needed.

## Smoke test after deploy

Run these in order. Each must pass before declaring deploy successful:

| # | Test | Expected |
|---|---|---|
| 1 | `GET /health` | 200, `{db: "connected"}` |
| 2 | `POST /auth/send-otp` with a real email | 200, OTP email arrives within 30s |
| 3 | `POST /auth/verify-otp` with the OTP code | 200, returns JWT token |
| 4 | `GET /auth/me` with `Authorization: Bearer <token>` | 200, user JSON |
| 5 | `GET /generated-designs` | 200, items array with `model_url` populated |
| 6 | `POST /products/<id>/vote` (authed) | 200, vote registered |
| 7 | `POST /gpt/query` (`{message: "hello"}`) | 200, `reply` field returned |
| 8 | `GET /articles` | 200, articles array |
| 9 | CORS preflight from production frontend origin | 204 |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pip install` fails with garbled requirements | `requirements.txt` was UTF-16 | Fixed — file is now UTF-8 |
| OTP emails never arrive | Gmail App Password missing/wrong | Create at <https://myaccount.google.com/apppasswords> |
| GSNowGPT returns 503 | `OPENAI_API_KEY` not set | Add the env var |
| Frontend gets CORS error | `ALLOWED_ORIGINS` missing the prod origin | Add exact URL with protocol |
| `/health` returns 503 with DB error | `POSTGRESQL_URI` wrong or pooler not reachable | Use Supabase pooler URL (port 6543) |
| Deploy image is 400 MB larger than expected | `playwright` got installed accidentally | Use `requirements.txt` only, not `requirements-design.txt` |
