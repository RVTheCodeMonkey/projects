from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from auth import get_current_active_user
from database import get_db
from models import Project, ProjectMember
from permissions import ROLE_RANK, get_invite

router = APIRouter(prefix="/api/invites", tags=["invites"])


@router.get("/{token}")
def get_invite_info(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    invite = get_invite(db, token)
    project = db.query(Project).filter(Project.id == invite.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "project_id": project.id,
        "project_name": project.name,
        "role": invite.role,
        "invited_email": invite.invited_email,
        "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
    }


@router.post("/{token}/accept")
def accept_invite(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    invite = get_invite(db, token)

    if invite.invited_email and current_user.email != invite.invited_email:
        raise HTTPException(
            status_code=403,
            detail="This invite is tied to a different email address. Please sign in or register with the invited email.",
        )

    existing = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == invite.project_id,
            ProjectMember.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        if ROLE_RANK[invite.role] > ROLE_RANK[existing.role]:
            existing.role = invite.role
    else:
        db.add(
            ProjectMember(
                project_id=invite.project_id,
                user_id=current_user.id,
                role=invite.role,
            )
        )

    invite.used_at = datetime.now(timezone.utc)
    db.commit()

    return {"project_id": invite.project_id, "role": invite.role}
