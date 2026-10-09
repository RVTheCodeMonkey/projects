from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from database import engine, Base
from routers import auth, invites, projects, public, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Projects API", lifespan=lifespan)

# CORS is only needed for local development; same-origin through Caddy in production.
if os.getenv("DEV_CORS", "false").lower() == "true":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(invites.router)
app.include_router(projects.router)
app.include_router(public.router)
app.include_router(users.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
