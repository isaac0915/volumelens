# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start all services (builds image on first run)
docker compose up --build

# Start without rebuilding (after first run)
docker compose up

# Stop all services
docker compose down

# View logs
docker compose logs -f api

# Rebuild after requirements.txt changes
docker compose up --build
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

**Request flow (current state):**
Every call to `GET /api/stock/{stock_id}` makes a synchronous Fugle REST API call inline. `app/services/stock_poller.py` contains a background polling service (`poll_stocks`) with a 3-second interval and an in-memory `stock_cache`, but it is **not yet wired into `main.py`** — `lifespan` is not configured.

**Database layer (`app/core/database.py`):**
Async SQLAlchemy engine using `asyncpg`. `Base` (DeclarativeBase) is defined but no models exist yet. `get_db()` is an async dependency yielding a session. Alembic is installed but migrations have not been initialized.

**Config (`app/core/config.py`):**
`pydantic-settings` reads from `.env`. Currently only `DATABASE_URL` is declared. The Fugle API key is hardcoded directly in `main.py` and should be moved to `.env` + `Settings`.

## Key Files

- `app/main.py` — app entry point, all current routes, Fugle client init
- `app/services/stock_poller.py` — background poller (not yet active); edit `WATCHED_SYMBOLS` here to change tracked stocks
- `app/core/database.py` — SQLAlchemy async setup; add ORM models by subclassing `Base`
- `.env` — PostgreSQL credentials + `DATABASE_URL`; gitignored
