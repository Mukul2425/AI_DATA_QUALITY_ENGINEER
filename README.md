# AI Data Quality Engineer

A production-grade GenAI data quality platform that profiles datasets, runs rule-based validation, explains issues in plain English, and proposes safe cleaning steps.

## Tech Stack
- Backend: FastAPI, PostgreSQL, SQLAlchemy, Celery + Redis, Pandas, Great Expectations
- GenAI: Gemini API (configurable provider)
- Frontend: React + Tailwind (Vite)
- Deployment: Docker + Railway

## Architecture (placeholder)
```
[Frontend] -> [FastAPI API] -> [Postgres]
                    |-> [Celery Worker] -> [Redis]
                    |-> [Gemini API]
```

## Quick Start (Local + Docker)
1. Copy env file
   - `cp .env.example .env`
2. Start services
   - `docker compose up --build`
3. Apply migrations
   - `docker compose exec backend alembic upgrade head`
4. Open API docs
   - http://localhost:8000/docs

## Local (without Docker)
1. Copy env file
   - `cp .env.example backend/.env`
2. Install deps
   - `pip install -r backend/requirements.txt`
3. Run API
   - `cd backend && uvicorn app.main:app --reload`

## Project Status
- Phase 0: Project foundation scaffolded
- Phase 1: FastAPI base + DB models + auth scaffolded
- Phase 2: Profiling + rule validation scaffolded

## Roadmap
See the original phased roadmap in the project plan.
