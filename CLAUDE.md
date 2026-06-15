# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

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

Local dev (IDE intellisense only — app runs in Docker):
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Architecture

**Two-service Docker Compose setup:**
- `api` — FastAPI app on port 8000, live-reloads via volume mount (`.:/app`)
- `db` — PostgreSQL 16; `api` waits for its healthcheck before starting

**Request flow:**
On startup, `lifespan` in `main.py` launches `poll_stocks` as an asyncio background task. The poller fetches quotes for `WATCHED_SYMBOLS` (default: `["2330", "2317"]`) every 3 seconds via the Fugle REST API, persists each quote to the `stock_quotes` table, checks for a volume spike (5-day rolling average from DB vs. 2× threshold), and writes to the in-memory `stock_cache`. `GET /api/stocks` returns the cache; `GET /api/stock/{stock_id}` makes a direct synchronous Fugle call.

**Volume spike detection:**
`app/services/volume_detection.py` exposes `is_volume_spike(current, average, threshold=2.0)`. The poller queries a 5-day rolling average from the DB per cycle. `app/services/radar.py` is a separate full-market scanner (not yet wired into `main.py`) — on init it fetches 20-day historical averages for all Taiwan equity tickers, then scans the full market every 60 seconds with up to 10 concurrent Fugle calls.

**Database layer (`app/core/database.py`):**
Async SQLAlchemy engine using `asyncpg`. `AsyncSessionLocal` is used directly by background services. `get_db()` is the async dependency for FastAPI routes. Alembic uses an async engine (`alembic/env.py`); new models must be imported there (with `# noqa: F401`) so autogenerate can detect them.

**Config (`app/core/config.py`):**
`pydantic-settings` reads `.env` with `extra = "ignore"`. Fields: `DATABASE_URL`, `FUGLE_API_KEY`. Copy `.env.example` to `.env` to get started.

## Key Files

- `app/main.py` — FastAPI entry point; `lifespan` starts the stock poller; all HTTP routes
- `app/services/stock_poller.py` — background poller; edit `WATCHED_SYMBOLS` to change tracked stocks
- `app/services/volume_detection.py` — `is_volume_spike()` utility
- `app/models/stock_quote.py` — `StockQuote` ORM model; add new models by subclassing `Base` from `app.core.database`
- `alembic/env.py` — Alembic async config; import new models here so autogenerate detects them
- `.env` — credentials (gitignored); see `.env.example`
