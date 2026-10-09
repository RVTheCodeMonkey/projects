import os
from functools import lru_cache
from typing import Optional


class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://projects:projects@projects-db/projects",
    )

    @property
    def sqlalchemy_database_url(self) -> str:
        url = self.DATABASE_URL
        # Allow users to pass either psycopg or psycopg2 dialect; normalize to psycopg2
        if url.startswith("postgresql+psycopg:"):
            url = url.replace("postgresql+psycopg:", "postgresql+psycopg2:", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/data/uploads")
    MAX_UPLOAD_SIZE: int = int(os.getenv("MAX_UPLOAD_SIZE", "104857600"))

    # SMTP / email
    SMTP_HOST: Optional[str] = os.getenv("SMTP_HOST")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT") or 587)
    SMTP_USER: Optional[str] = os.getenv("SMTP_USER")
    SMTP_PASS: Optional[str] = os.getenv("SMTP_PASS")
    SMTP_FROM: Optional[str] = os.getenv("SMTP_FROM")
    APP_BASE_URL: Optional[str] = os.getenv("APP_BASE_URL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
