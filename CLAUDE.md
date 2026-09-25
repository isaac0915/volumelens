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
On startup, `lifespan` in `main.py` launches three asyncio background tasks: `poll_stocks`, `run_radar` and `run_daily_sync`. The poller fetches quotes for `WATCHED_SYMBOLS` (default: `["2330", "2317"]`) every 3 seconds via the Fugle REST API, persists each quote to `stock_quotes`, computes a 5-day rolling average volume from the DB, checks for a spike (2× threshold via `is_volume_spike()`), and writes to the in-memory `stock_cache`. `/api/stocks` returns that cache plus `market_open`; any watched symbol missing from it (outside market hours or after a restart) falls back to its latest daily candle via `get_latest_closes()` (`source: "close"`, volume converted to lots), so the dashboard never renders empty.

**Frontend proxy:**
`next.config.mjs` rewrites all `/api/*` requests to `http://localhost:8000/api/*`, so the frontend calls `/api/stocks` and the backend receives it — both must be running simultaneously.

**Radar scanner (`app/services/radar.py`):**
A full-market scanner started as a second `asyncio.create_task` in `main.py`'s `lifespan`. It only runs during market hours (`is_market_open()` in `app/services/market_hours.py`, shared with the poller). Once per trading day it loads each symbol's 20-trading-day average volume from `stock_candles` with a `ROW_NUMBER()` window query joined to `stocks` for the exchange (~0.2s, ~2,300 TWSE+TPEx symbols; <10 days of history skipped). Each scan then fetches cumulative intraday volume from TWSE's undocumented MIS endpoint (`app/services/mis_quotes.py`: 100 symbols per request — more returns rtcode 9999 — spaced 2s apart, ~24 requests / ~70s per full scan; quotes not dated today are dropped) and persists spikes (≥2× average and ≥500 lots) as `VolumeAlert` rows. Fugle's per-symbol quotes can't cover the market within rate limits and its batch `snapshot` endpoints are Forbidden on the current plan, so Fugle is only used by the poller. Units: candles store **shares**, intraday volumes are **lots (張)**, so averages are divided by 1,000; `VolumeAlert` volumes are in lots.

**Stock candles / backfill (`app/models/stock_candle.py`, `app/script/backfill_candles.py`):**
`StockCandle` stores daily OHLCV + turnover/change per symbol (unique on `symbol`+`date`; `volume` is `BigInteger` since some ETFs trade >2.1B shares/day). `backfill_candles.py` is a standalone script (not run by the API) that pulls daily candles from Fugle for the whole market (or `--symbols`) over the last `--days` (default 180) and inserts them with `ON CONFLICT DO NOTHING`, committing per symbol and retrying on HTTP 429 — safe to re-run. Test with `--limit 5`: `docker compose exec api python -m app.script.backfill_candles --limit 5`.

**Market-wide daily data (`app/services/exchange_daily.py`, `app/script/backfill_market.py`):**
Historical daily candles come from the TWSE (`MI_INDEX`) and TPEx (`dailyQuotes`) website JSON endpoints — one request per exchange per day returns the whole market, versus one Fugle call per symbol. `fetch_market_day()` parses and cleans both (comma-separated numbers, `--`/`---` for no trade, TWSE's HTML sign column, TPEx trailing spaces) and keeps only 4-digit stocks and `00`-prefixed ETFs (~2,300 symbols). These endpoints are undocumented: TPEx often truncates its ~2MB response (retried up to 3x), and TWSE blocks IPs that request too fast (3s throttle). `run_daily_sync()` (`app/services/daily_sync.py`, started in `lifespan`) is a reconciliation loop: every 30 minutes it syncs any incomplete weekday in the last 10 days (today only after 15:30 Taipei), so missed days and late publications are filled in automatically; complete days (≥2,000 rows) cost only a count query, and holidays (no data from either exchange) are remembered in memory. `backfill_market.py --days 180` uses the same `sync_range()` for the initial load or longer gaps and is safe to re-run. Fugle stays the source for intraday data (poller, radar scans).

**Database layer (`app/core/database.py`):**
Async SQLAlchemy engine using `asyncpg`. `AsyncSessionLocal` is used directly by background services. `get_db()` is the async dependency for FastAPI routes. Alembic uses an async engine (`alembic/env.py`); new models must be imported there (with `# noqa: F401`) so autogenerate can detect them.

**Config (`app/core/config.py`):**
`pydantic-settings` reads `.env` with `extra = "ignore"`. Fields: `DATABASE_URL`, `FUGLE_API_KEY`, `FORCE_POLL` (set to `true` to bypass market-hours check during development).

## Key Files

- `app/main.py` — FastAPI entry point; `lifespan` starts the stock poller and radar scanner; all HTTP routes (`/api/stocks`, `/api/search`, `/api/alerts`, `/api/stocks/{symbol}/detail`)
- `app/services/stock_poller.py` — background poller; edit `WATCHED_SYMBOLS` to change tracked stocks
- `app/services/radar.py` — full-market volume spike scanner; 20-day averages from `stock_candles`, intraday volume from TWSE MIS; persists spikes to `VolumeAlert`
- `app/services/mis_quotes.py` — batched intraday volume from TWSE's MIS endpoint (TWSE + TPEx symbols)
- `app/services/market_hours.py` — `is_market_open()` (Mon–Fri 09:00–13:30 Asia/Taipei, bypassed by `FORCE_POLL`); used by poller and radar
- `app/services/volume_detection.py` — `is_volume_spike()` utility
- `app/models/stock_quote.py` — `StockQuote` ORM model; add new models by subclassing `Base` from `app.core.database`
- `app/models/volume_alert.py` — `VolumeAlert` ORM model, persisted by the radar scanner
- `app/models/stock.py` — `Stock` (symbol → name, exchange TWSE/TPEx), upserted by the daily sync; `ensure_stock_list()` fills it if empty
- `app/models/stock_candle.py` — `StockCandle` ORM model (daily OHLCV), populated only via the backfill script
- `app/services/daily_sync.py` — `run_daily_sync()` background task + `sync_range()` shared with the backfill script
- `app/services/exchange_daily.py` — fetch/clean one day of whole-market candles from TWSE + TPEx
- `app/script/backfill_market.py` — whole-market daily backfill by date (TWSE + TPEx); preferred over `backfill_candles.py`
- `app/script/backfill_candles.py` — per-symbol Fugle backfill (e.g. `--symbols 2330`); not run by the API
- `alembic/env.py` — Alembic async config; import new models here so autogenerate detects them
- `frontend/app/layout.js` + `frontend/components/NavBar.js` / `StockSearch.js` — site shell: sticky nav (首頁 / 爆量雷達), stock search backed by `/api/search` (symbol prefix or name substring, keyboard navigable), max-w-6xl container, data-source footer. UI copy is Traditional Chinese
- `frontend/app/page.js` — Next.js dashboard; polls `/api/stocks` every 3 seconds; shows Live vs 已收盤 from `market_open`
- `frontend/app/stock/[symbol]/page.js` + `Charts.js` — per-stock detail page with price/volume charts, backed by `/api/stocks/{symbol}/detail`
- `frontend/next.config.mjs` — proxy rewrite from `/api/*` to backend
- `.env` — credentials (gitignored); see `.env.example`
