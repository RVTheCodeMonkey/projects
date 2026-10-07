from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from models import Project
from permissions import get_public_project
from services import mpxj_service

router = APIRouter(prefix="/api/public", tags=["public"])
settings = get_settings()


@router.get("/projects/{token}")
def read_public_project(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    project = get_public_project(token, db)
    stored_path = Path(settings.UPLOAD_DIR) / project.stored_filename
    if not stored_path.exists():
        raise HTTPException(status_code=404, detail="Project file not found")

    try:
        parsed = mpxj_service.parse_project_file(str(stored_path))
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to parse project file: {exc}"
        )

    data = mpxj_service.merge_edited_data(parsed, project.edited_data)

    return {
        "id": project.id,
        "name": project.name,
        "original_filename": project.original_filename,
        "file_format": project.file_format,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "role": "public",
        "data": data,
    }
