# AI Data Quality Engineer

A production-grade GenAI data quality platform that profiles datasets, runs rule-based validation, explains issues in plain English, and proposes safe cleaning steps.

## Tech Stack
- Backend: FastAPI, PostgreSQL, SQLAlchemy, Celery + Redis, Pandas
- GenAI: Gemini API (primary + fallback model)
- Frontend: React + Tailwind (Vite)
- Deployment: Docker + Railway

## Architecture (placeholder)
```
[Frontend] -> [FastAPI API] -> [Postgres]
                    |-> [Celery Worker] -> [Redis]
                    |-> [Gemini API]
```

## Quick Start (Docker)
1. Copy env file
   - `cp .env.example .env`
2. Add your Gemini key in `.env`
   - `GEMINI_API_KEY=...`
3. Start services
   - `docker compose up --build`
4. Run migrations
   - `docker compose exec backend alembic upgrade head`
5. Open apps
   - API: http://localhost:8000/docs
   - Frontend: http://localhost:5173

## Local (Without Docker)
1. Copy env file
   - `cp .env.example backend/.env`
2. Install deps
   - `pip install -r backend/requirements.txt`
3. Run API
   - `cd backend && uvicorn app.main:app --reload`

## Core API Endpoints
- Auth
  - `POST /auth/register`
  - `POST /auth/login`
- Datasets
  - `POST /datasets/upload?process=true`
  - `POST /datasets/{id}/process-async`
  - `POST /datasets/{id}/explain`
  - `POST /datasets/{id}/clean`
  - `GET /datasets/{id}/cleaned-file`
  - `GET /datasets/{id}/report`

## Deployment (Railway)
1. Push to GitHub (already wired)
2. Create new Railway project
3. Connect GitHub repo
4. Add services:
   - Postgres
   - Redis
5. Add environment variables:
   - `DATABASE_URL` (from Railway Postgres)
   - `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` (from Redis)
   - `GEMINI_API_KEY`
   - `SECRET_KEY`
   - `CORS_ORIGINS` (your deployed frontend URL)
6. Deploy Docker services
7. Run migrations:
   - `railway run alembic upgrade head`

## Notes
- LLM rate limits fall back to a rule-based summary and cleaning plan.
- Cleaning runs safely in Python and never executes arbitrary code.

## Roadmap
See the original phased roadmap in the project plan.
