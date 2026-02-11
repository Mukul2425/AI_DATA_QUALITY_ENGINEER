from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure all SQLAlchemy models are registered before first query
import app.models  # noqa: F401

from app.api.routes.health import router as health_router
from app.api.routes.auth import router as auth_router
from app.api.routes.datasets import router as datasets_router
from app.core.config import get_settings
from app.utils.files import ensure_dir

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(datasets_router)


@app.on_event("startup")
def startup_event():
    ensure_dir(settings.upload_dir)
    ensure_dir(settings.cleaned_dir)
