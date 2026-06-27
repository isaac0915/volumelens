# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Backend (Docker):**
```bash
# Start all services (builds image on first run)
docker compose up --build

# Start without rebuilding
docker compose up

# Stop all services
docker compose down

# View logs
docker compose logs -f api

# Run Alembic migrations
docker compose exec api alembic upgrade head

# Generate a new migration after changing models
docker compose exec api alembic revision --autogenerate -m "description"
```

**Frontend (Next.js):**
```bash
cd frontend
npm run dev   # http://localhost:3000
```

**Local Python env (IDE intellisense only — app runs in Docker):**
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Architecture

**Services:**
- `api` — FastAPI on port 8000, live-reloads via volume mount (`.:/app`)
- `db` — PostgreSQL 16; `api` waits for its healthcheck before starting
- `frontend` — Next.js on port 3000 (run separately, not in Docker Compose)

**Request flow:**
On startup, `lifespan` in `main.py` launches `poll_stocks` as an asyncio background task. The poller fetches quotes for `WATCHED_SYMBOLS` (default: `["2330", "2317"]`) every 3 seconds via the Fugle REST API, persists each quote to `stock_quotes`, computes a 5-day rolling average volume from the DB, checks for a spike (2× threshold via `is_volume_spike()`), and writes to the in-memory `stock_cache`. Volume spike alerts currently print to stdout only.

**Frontend proxy:**
`next.config.mjs` rewrites all `/api/*` requests to `http://localhost:8000/api/*`, so the frontend calls `/api/stocks` and the backend receives it — both must be running simultaneously.

**Radar scanner (`app/services/radar.py`):**
A full-market scanner that fetches 30-day historical averages for all Taiwan equity tickers on init, then scans the full market every 60 seconds with up to 10 concurrent Fugle calls. It is **not yet wired into `main.py`** — call `run_radar(client)` as a second `asyncio.create_task` in `lifespan` to enable it.

**Database layer (`app/core/database.py`):**
Async SQLAlchemy engine using `asyncpg`. `AsyncSessionLocal` is used directly by background services. `get_db()` is the async dependency for FastAPI routes. Alembic uses an async engine (`alembic/env.py`); new models must be imported there (with `# noqa: F401`) so autogenerate can detect them.

**Config (`app/core/config.py`):**
`pydantic-settings` reads `.env` with `extra = "ignore"`. Fields: `DATABASE_URL`, `FUGLE_API_KEY`, `FORCE_POLL` (set to `true` to bypass market-hours check during development).

## Key Files

- `app/main.py` — FastAPI entry point; `lifespan` starts the stock poller; all HTTP routes
- `app/services/stock_poller.py` — background poller; edit `WATCHED_SYMBOLS` to change tracked stocks
- `app/services/radar.py` — full-market volume spike scanner; not yet started by `main.py`
- `app/services/volume_detection.py` — `is_volume_spike()` utility
- `app/models/stock_quote.py` — `StockQuote` ORM model; add new models by subclassing `Base` from `app.core.database`
- `alembic/env.py` — Alembic async config; import new models here so autogenerate detects them
- `frontend/app/page.js` — Next.js dashboard; polls `/api/stocks` every 3 seconds
- `frontend/next.config.mjs` — proxy rewrite from `/api/*` to backend
- `.env` — credentials (gitignored); see `.env.example`
