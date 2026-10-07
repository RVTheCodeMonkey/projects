import io
import re
import secrets
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import exists, or_
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from models import Project, ProjectInvite, ProjectMember, ProjectVersion, User
from auth import get_current_active_user
from permissions import (
    get_invite,
    get_member_role,
    get_project_member,
    get_project_with_role,
    require_project_role,
    ROLE_RANK,
)
from services import mpxj_service, xml_writer

router = APIRouter(prefix="/api/projects", tags=["projects"])
settings = get_settings()

Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".mpp", ".mpt", ".mpx", ".xml"}


class TaskExportItem(BaseModel):
    uid: str
    name: str
    start: str
    finish: str
    percent_complete: int
    color: Optional[str] = None
    duration: Optional[Dict[str, Any]] = None
    id: Optional[str] = None
    outline_level: Optional[int] = None
    outline_number: Optional[str] = None
    milestone: bool = False
    summary: bool = False


class ExportRequest(BaseModel):
    tasks: List[TaskExportItem]
    row_labels: Optional[Dict[str, str]] = None


class SaveRequest(BaseModel):
    tasks: List[TaskExportItem]
    row_labels: Optional[Dict[str, str]] = None


class MemberAddRequest(BaseModel):
    email: str
    role: str


class RoleUpdateRequest(BaseModel):
    role: str


class InviteCreateRequest(BaseModel):
    role: str


class PublicToggleRequest(BaseModel):
    is_public: bool


class CreateProjectRequest(BaseModel):
    name: Optional[str] = Field(default="New project", max_length=255)


def _parse_project_data(project: Project) -> Dict[str, Any]:
    stored_path = Path(settings.UPLOAD_DIR) / project.stored_filename
    if not stored_path.exists():
        raise HTTPException(status_code=404, detail="Project file not found")
    try:
        parsed = mpxj_service.parse_project_file(str(stored_path))
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to parse project file: {exc}"
        )
    return mpxj_service.merge_edited_data(parsed, project.edited_data)


def _compute_edited_data(
    baseline_tasks: List[Dict[str, Any]], client_tasks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    baseline_by_uid = {str(t.get("uid")): t for t in baseline_tasks if t.get("uid")}
    client_uids = {str(t.get("uid")) for t in client_tasks if t.get("uid")}
    edited: Dict[str, Any] = {}
    created: List[Dict[str, Any]] = []

    for task in client_tasks:
        uid = str(task.get("uid"))
        if not uid:
            continue
        baseline = baseline_by_uid.get(uid)
        if baseline is None:
            created.append(task)
            continue

        changes: Dict[str, Any] = {}
        for field in ("name", "start", "finish", "percent_complete", "color"):
            if task.get(field) != baseline.get(field):
                changes[field] = task.get(field)
        if changes:
            edited[uid] = changes

    deleted = [uid for uid in baseline_by_uid if uid not in client_uids]

    return {"edited": edited, "created": created, "deleted": deleted}


def _recompute_edited_data(
    baseline_tasks: List[Dict[str, Any]], merged_tasks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    return _compute_edited_data(baseline_tasks, merged_tasks)


def _serialize_project(project: Project, role: Optional[str] = None) -> Dict[str, Any]:
    return {
        "id": project.id,
        "name": project.name,
        "original_filename": project.original_filename,
        "file_size": project.file_size,
        "file_format": project.file_format,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "is_public": project.is_public,
        "public_token": project.public_token,
        "role": role,
    }


@router.get("")
def list_projects(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    projects = (
        db.query(Project)
        .filter(
            or_(
                Project.owner_id == current_user.id,
                db.query(ProjectMember)
                .filter(
                    ProjectMember.project_id == Project.id,
                    ProjectMember.user_id == current_user.id,
                )
                .exists(),
            )
        )
        .order_by(Project.created_at.desc())
        .all()
    )

    project_ids = [p.id for p in projects]
    memberships = {
        m.project_id: m.role
        for m in db.query(ProjectMember)
        .filter(
            ProjectMember.project_id.in_(project_ids),
            ProjectMember.user_id == current_user.id,
        )
        .all()
    }

    result = []
    for p in projects:
        role = memberships.get(p.id)
        if p.owner_id == current_user.id and not role:
            role = "owner"
        result.append(_serialize_project(p, role=role))
    return result


@router.post("")
def upload_project(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {suffix}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = file.file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    stored_name = f"{uuid.uuid4().hex}{suffix}"
    stored_path = Path(settings.UPLOAD_DIR) / stored_name
    stored_path.write_bytes(content)

    project = Project(
        name=Path(file.filename).stem,
        original_filename=file.filename,
        stored_filename=stored_name,
        file_size=len(content),
        file_format=suffix.lstrip(".").upper(),
        owner_id=current_user.id,
        edited_data=None,
        is_public=False,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Owner membership
    db.add(
        ProjectMember(
            project_id=project.id,
            user_id=current_user.id,
            role="owner",
        )
    )
    db.commit()

    return _serialize_project(project, role="owner")


@router.post("/create")
def create_project(
    request: Request,
    payload: CreateProjectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    name = (payload.name or "New project").strip() or "New project"
    safe_filename = re.sub(r"[^\w\s-]", "", name).strip() or "project"
    original_filename = f"{safe_filename}.xml"

    stored_name = f"{uuid.uuid4().hex}.xml"
    stored_path = Path(settings.UPLOAD_DIR) / stored_name
    xml_writer.create_blank_project_file(str(stored_path), name)

    project = Project(
        name=name,
        original_filename=original_filename,
        stored_filename=stored_name,
        file_size=stored_path.stat().st_size,
        file_format="XML",
        owner_id=current_user.id,
        edited_data=None,
        is_public=False,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    db.add(
        ProjectMember(
            project_id=project.id,
            user_id=current_user.id,
            role="owner",
        )
    )
    db.commit()

    return _serialize_project(project, role="owner")


@router.get("/{project_id}")
def get_project(
    project_id: int,
    request: Request,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("viewer")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = _parse_project_data(project)
    members = (
        db.query(ProjectMember, User.email)
        .join(User, User.id == ProjectMember.user_id)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )

    return {
        **_serialize_project(project, role=project_member.role),
        "members": [
            {"user_id": m.user_id, "email": email, "role": m.role}
            for m, email in members
        ],
        "data": data,
    }


def _parse_project_file_baseline(project: Project) -> Dict[str, Any]:
    stored_path = Path(settings.UPLOAD_DIR) / project.stored_filename
    if not stored_path.exists():
        raise HTTPException(status_code=404, detail="Project file not found")
    try:
        return mpxj_service.parse_project_file(str(stored_path))
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to parse project file: {exc}"
        )


@router.post("/{project_id}/save")
def save_project(
    project_id: int,
    payload: SaveRequest,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("editor")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    baseline = _parse_project_file_baseline(project)
    edited_data = _compute_edited_data(
        baseline.get("tasks", []), [t.model_dump() for t in payload.tasks]
    )
    row_labels = payload.row_labels or {}
    if row_labels:
        edited_data["row_labels"] = row_labels
    else:
        edited_data.pop("row_labels", None)
    project.edited_data = edited_data
    db.commit()
    return {"status": "saved"}


@router.post("/{project_id}/export")
def export_project(
    project_id: int,
    payload: ExportRequest,
    request: Request,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("editor")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    stored_path = Path(settings.UPLOAD_DIR) / project.stored_filename
    if not stored_path.exists():
        raise HTTPException(status_code=404, detail="Project file not found")

    output_path = Path(tempfile.gettempdir()) / f"{uuid.uuid4().hex}.xml"

    # Deleted tasks are inferred from the current payload so exports reflect
    # unsaved UI changes as well as saved deletions.
    baseline = _parse_project_file_baseline(project)
    baseline_uids = {str(t.get("uid")) for t in baseline.get("tasks", []) if t.get("uid")}
    client_uids = {str(t.uid) for t in payload.tasks}
    deleted_uids = [uid for uid in baseline_uids if uid not in client_uids]

    try:
        xml_writer.write_export(
            str(stored_path),
            str(output_path),
            [t.model_dump() for t in payload.tasks],
            deleted_uids=deleted_uids,
            row_labels=payload.row_labels or {},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to export project: {exc}"
        )

    def stream_file():
        with open(output_path, "rb") as f:
            yield from f
        output_path.unlink(missing_ok=True)

    safe_name = project.name.replace(" ", "_") or "project"
    return StreamingResponse(
        stream_file(),
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.xml"'
        },
    )


@router.post("/{project_id}/version")
def upload_version(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
    project_member=Depends(require_project_role("editor")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {suffix}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = file.file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    # Archive current version
    db.add(
        ProjectVersion(
            project_id=project.id,
            stored_filename=project.stored_filename,
            original_filename=project.original_filename,
            file_size=project.file_size,
            file_format=project.file_format,
            created_by=current_user.id,
        )
    )

    # Store new file
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    stored_path = Path(settings.UPLOAD_DIR) / stored_name
    stored_path.write_bytes(content)

    project.stored_filename = stored_name
    project.original_filename = file.filename
    project.name = Path(file.filename).stem
    project.file_size = len(content)
    project.file_format = suffix.lstrip(".").upper()

    # Merge saved edits/created tasks into the new file
    try:
        new_parsed = mpxj_service.parse_project_file(str(stored_path))
    except Exception as exc:
        # Rollback file? Leave new file and raise
        raise HTTPException(
            status_code=500, detail=f"Failed to parse new project file: {exc}"
        )

    merged = mpxj_service.merge_edited_data(new_parsed, project.edited_data)
    edited_data = _recompute_edited_data(
        new_parsed.get("tasks", []), merged.get("tasks", [])
    )

    # Preserve custom row labels across version uploads. Filter out labels
    # whose outline number no longer exists in the new baseline.
    existing_outline_numbers = {
        str(t.get("outline_number")).split(".")[0]
        for t in new_parsed.get("tasks", [])
        if t.get("outline_number")
    }
    old_row_labels = (project.edited_data or {}).get("row_labels") or {}
    if old_row_labels:
        edited_data["row_labels"] = {
            k: v for k, v in old_row_labels.items() if k in existing_outline_numbers
        }
    project.edited_data = edited_data

    db.commit()
    db.refresh(project)

    return _serialize_project(project, role=project_member.role)


@router.get("/{project_id}/versions")
def list_versions(
    project_id: int,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("editor")),
):
    versions = (
        db.query(ProjectVersion)
        .filter(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.created_at.desc())
        .all()
    )
    return [
        {
            "id": v.id,
            "original_filename": v.original_filename,
            "file_size": v.file_size,
            "file_format": v.file_format,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in versions
    ]


@router.get("/{project_id}/members")
def list_members(
    project_id: int,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("viewer")),
):
    members = (
        db.query(ProjectMember, User.email)
        .join(User, User.id == ProjectMember.user_id)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    return [
        {"user_id": m.user_id, "email": email, "role": m.role}
        for m, email in members
    ]


@router.post("/{project_id}/members")
def add_member(
    project_id: int,
    payload: MemberAddRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
    project_member=Depends(require_project_role("editor")),
):
    allowed_roles = {"editor", "viewer"}
    if payload.role == "owner":
        if project_member.role != "owner":
            raise HTTPException(status_code=403, detail="Only owners can add owners")
        allowed_roles.add("owner")

    if payload.role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role")

    target = db.query(User).filter(User.email == payload.email).first()
    if not target:
        raise HTTPException(
            status_code=404,
            detail="User not found. Send an invite link instead.",
        )

    existing = get_project_member(db, project_id, target.id)
    if existing:
        if ROLE_RANK[existing.role] >= ROLE_RANK[project_member.role]:
            raise HTTPException(
                status_code=403, detail="You cannot change this member's role"
            )
        existing.role = payload.role
        db.commit()
        return {"user_id": target.id, "email": target.email, "role": existing.role}

    db.add(
        ProjectMember(
            project_id=project_id,
            user_id=target.id,
            role=payload.role,
        )
    )
    db.commit()
    return {"user_id": target.id, "email": target.email, "role": payload.role}


@router.delete("/{project_id}/members/{user_id}")
def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("owner")),
):
    if project_member.user_id == user_id:
        # Count owners to avoid leaving the project ownerless
        owner_count = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.role == "owner")
            .count()
        )
        if owner_count <= 1:
            raise HTTPException(
                status_code=400, detail="Cannot remove the only owner"
            )

    target = get_project_member(db, project_id, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(target)
    db.commit()
    return {"status": "removed"}


@router.patch("/{project_id}/members/{user_id}")
def update_member_role(
    project_id: int,
    user_id: int,
    payload: RoleUpdateRequest,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("owner")),
):
    if payload.role not in {"owner", "editor", "viewer"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    target = get_project_member(db, project_id, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if payload.role == "owner" and target.role != "owner":
        # Promoting to owner is fine
        pass
    elif target.role == "owner" and payload.role != "owner":
        owner_count = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.role == "owner")
            .count()
        )
        if owner_count <= 1:
            raise HTTPException(
                status_code=400, detail="Cannot demote the only owner"
            )

    target.role = payload.role
    db.commit()
    return {"user_id": target.user_id, "role": target.role}


@router.post("/{project_id}/invites")
def create_invite(
    project_id: int,
    payload: InviteCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
    project_member=Depends(require_project_role("editor")),
):
    allowed_roles = {"editor", "viewer"}
    if payload.role == "owner":
        if project_member.role != "owner":
            raise HTTPException(status_code=403, detail="Only owners can create owner invites")
        allowed_roles.add("owner")

    if payload.role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    invite = ProjectInvite(
        project_id=project_id,
        token=token,
        role=payload.role,
        created_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()

    return {
        "token": token,
        "role": payload.role,
        "expires_at": expires_at.isoformat(),
        "link": f"/invite/{token}",
    }


@router.post("/{project_id}/public")
def toggle_public(
    project_id: int,
    payload: PublicToggleRequest,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("owner")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.is_public = payload.is_public
    if payload.is_public and not project.public_token:
        project.public_token = secrets.token_urlsafe(32)

    db.commit()
    db.refresh(project)

    return {
        "is_public": project.is_public,
        "public_token": project.public_token,
        "link": f"/public/{project.public_token}" if project.is_public else None,
    }


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    project_member=Depends(require_project_role("owner")),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete stored files
    current_path = Path(settings.UPLOAD_DIR) / project.stored_filename
    current_path.unlink(missing_ok=True)
    for version in project.versions:
        vpath = Path(settings.UPLOAD_DIR) / version.stored_filename
        vpath.unlink(missing_ok=True)

    db.delete(project)
    db.commit()
    return {"status": "deleted"}
