import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from auth import get_current_active_user, get_password_hash, require_admin
from database import get_db
from models import PasswordResetToken, Project, ProjectInvite, ProjectMember, ProjectVersion, User
from schemas import UserCreateAdmin, UserResponse, UserUpdateAdmin
from services.email import _build_base_url, send_password_set_email

router = APIRouter(prefix="/api/users", tags=["users"])

TOKEN_VALIDITY_DAYS = 7


def _serialize_user(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "is_admin": user.is_admin,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _create_password_set_token(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_VALIDITY_DAYS)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=expires_at,
        )
    )
    db.commit()
    return token


@router.get("", response_model=List[Dict[str, Any]])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.id).all()
    return [_serialize_user(u) for u in users]


@router.post("", response_model=UserResponse)
def create_user(
    payload: UserCreateAdmin,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    random_password = secrets.token_urlsafe(32)
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(random_password),
        is_admin=payload.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = _create_password_set_token(db, user)
    base_url = _build_base_url(request)
    background_tasks.add_task(
        send_password_set_email,
        user.email,
        token,
        base_url=base_url,
    )

    return user


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdateAdmin,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id and not payload.is_admin:
        raise HTTPException(status_code=400, detail="You cannot remove your own admin rights")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_admin = payload.is_admin
    db.commit()
    return _serialize_user(user)


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Reassign audit references so the user row can be deleted
    db.query(ProjectInvite).filter(ProjectInvite.created_by == target.id).update(
        {"created_by": admin.id}, synchronize_session=False
    )
    db.query(ProjectVersion).filter(ProjectVersion.created_by == target.id).update(
        {"created_by": admin.id}, synchronize_session=False
    )

    # Transfer project ownership to the admin performing the deletion
    owned_projects = db.query(Project).filter(Project.owner_id == target.id).all()
    for project in owned_projects:
        project.owner_id = admin.id
        membership = (
            db.query(ProjectMember)
            .filter_by(project_id=project.id, user_id=admin.id)
            .first()
        )
        if membership:
            membership.role = "owner"
        else:
            db.add(
                ProjectMember(project_id=project.id, user_id=admin.id, role="owner")
            )

    db.commit()
    db.expire(target, ["projects", "memberships"])

    db.delete(target)
    db.commit()
    return {"status": "deleted"}


@router.post("/{user_id}/send-password-link")
def send_password_link(
    user_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token = _create_password_set_token(db, user)
    base_url = _build_base_url(request)
    background_tasks.add_task(
        send_password_set_email,
        user.email,
        token,
        base_url=base_url,
    )
    return {"status": "email_sent"}
