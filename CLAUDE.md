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
On startup, `lifespan` in `main.py` launches two asyncio background tasks: `poll_stocks` and `run_radar`. The poller fetches quotes for `WATCHED_SYMBOLS` (default: `["2330", "2317"]`) every 3 seconds via the Fugle REST API, persists each quote to `stock_quotes`, computes a 5-day rolling average volume from the DB, checks for a spike (2× threshold via `is_volume_spike()`), and writes to the in-memory `stock_cache`.

**Frontend proxy:**
`next.config.mjs` rewrites all `/api/*` requests to `http://localhost:8000/api/*`, so the frontend calls `/api/stocks` and the backend receives it — both must be running simultaneously.

**Radar scanner (`app/services/radar.py`):**
A full-market scanner that fetches 20-day historical volume averages for all Taiwan equity tickers on init, then scans the full market every 60 seconds with up to 10 concurrent Fugle calls. It is wired into `main.py`'s `lifespan` as a second `asyncio.create_task`. Spikes (2× average) are persisted as `VolumeAlert` rows and logged, not just printed.

**Stock candles / backfill (`app/models/stock_candle.py`, `app/script/backfill_candles.py`):**
`StockCandle` stores daily OHLCV + turnover/change per symbol (unique on `symbol`+`date`). `backfill_candles.py` is a standalone one-off script (not run by the API) that pulls historical daily candles from Fugle for a hardcoded symbol/date range and upserts them, skipping days already stored — edit the `symbol`/date range at the top before running with `docker compose exec api python -m app.script.backfill_candles`.

**Database layer (`app/core/database.py`):**
Async SQLAlchemy engine using `asyncpg`. `AsyncSessionLocal` is used directly by background services. `get_db()` is the async dependency for FastAPI routes. Alembic uses an async engine (`alembic/env.py`); new models must be imported there (with `# noqa: F401`) so autogenerate can detect them.

**Config (`app/core/config.py`):**
`pydantic-settings` reads `.env` with `extra = "ignore"`. Fields: `DATABASE_URL`, `FUGLE_API_KEY`, `FORCE_POLL` (set to `true` to bypass market-hours check during development).

## Key Files

- `app/main.py` — FastAPI entry point; `lifespan` starts the stock poller and radar scanner; all HTTP routes (`/api/stocks`, `/api/alerts`, `/api/stocks/{symbol}/detail`)
- `app/services/stock_poller.py` — background poller; edit `WATCHED_SYMBOLS` to change tracked stocks
- `app/services/radar.py` — full-market volume spike scanner; started by `main.py`'s `lifespan`; persists spikes to `VolumeAlert`
- `app/services/volume_detection.py` — `is_volume_spike()` utility
- `app/models/stock_quote.py` — `StockQuote` ORM model; add new models by subclassing `Base` from `app.core.database`
- `app/models/volume_alert.py` — `VolumeAlert` ORM model, persisted by the radar scanner
- `app/models/stock_candle.py` — `StockCandle` ORM model (daily OHLCV), populated only via the backfill script
- `app/script/backfill_candles.py` — one-off standalone script to backfill `stock_candles` for a symbol/date range; not run by the API
- `alembic/env.py` — Alembic async config; import new models here so autogenerate detects them
- `frontend/app/page.js` — Next.js dashboard; polls `/api/stocks` every 3 seconds
- `frontend/app/stock/[symbol]/page.js` + `Charts.js` — per-stock detail page with price/volume charts, backed by `/api/stocks/{symbol}/detail`
- `frontend/next.config.mjs` — proxy rewrite from `/api/*` to backend
- `.env` — credentials (gitignored); see `.env.example`
