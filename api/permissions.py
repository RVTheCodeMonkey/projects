from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from models import Project, ProjectInvite, ProjectMember, User
from auth import get_current_active_user

settings = get_settings()

ROLE_RANK = {"viewer": 0, "editor": 1, "owner": 2}


def _rank(role: Optional[str]) -> int:
    return ROLE_RANK.get(role or "", -1)


def get_member_role(db: Session, project_id: int, user_id: int) -> Optional[str]:
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    return member.role if member else None


def get_project_member(
    db: Session, project_id: int, user_id: int
) -> Optional[ProjectMember]:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )


def require_project_role(min_role: str):
    """Return the member row if the current user has at least min_role on the project."""

    def _dependency(
        project_id: int,
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db),
    ) -> ProjectMember:
        member = get_project_member(db, project_id, current_user.id)
        if not member or _rank(member.role) < _rank(min_role):
            raise HTTPException(status_code=404, detail="Project not found")
        return member

    return _dependency


def get_project_with_role(min_role: str):
    """Return (project, member) if the user has at least min_role."""

    def _dependency(
        project_id: int,
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db),
    ) -> Tuple[Project, ProjectMember]:
        member = get_project_member(db, project_id, current_user.id)
        if not member or _rank(member.role) < _rank(min_role):
            raise HTTPException(status_code=404, detail="Project not found")
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project, member

    return _dependency


def get_public_project(token: str, db: Session) -> Project:
    project = (
        db.query(Project)
        .filter(Project.public_token == token, Project.is_public.is_(True))
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def get_invite(db: Session, token: str) -> ProjectInvite:
    invite = db.query(ProjectInvite).filter(ProjectInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.used_at:
        raise HTTPException(status_code=400, detail="Invite already used")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite expired")
    return invite
