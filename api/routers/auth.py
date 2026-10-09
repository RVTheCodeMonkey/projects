from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import PasswordResetToken, User
from auth import get_password_hash, verify_password, create_access_token, get_current_active_user
from schemas import UserRegister, UserLogin, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SetPasswordRequest(BaseModel):
    password: str


def _set_auth_cookie(response: Response, email: str) -> None:
    token = create_access_token(data={"sub": email})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,  # Set to True if serving over HTTPS in production
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
    )


@router.post("/register", response_model=UserResponse)
def register(payload: UserRegister, response: Response, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _set_auth_cookie(response, user.email)
    return user


@router.post("/login")
def login(payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    _set_auth_cookie(response, user.email)
    return {"email": user.email}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="access_token")
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.get("/reset-password/{token}")
def get_reset_password_token(token: str, db: Session = Depends(get_db)):
    reset = db.query(PasswordResetToken).filter(PasswordResetToken.token == token).first()
    if not reset:
        raise HTTPException(status_code=404, detail="Token not found")
    if reset.used_at:
        raise HTTPException(status_code=400, detail="Token already used")
    if reset.expires_at and reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expired")
    return {
        "email": reset.user.email,
        "expires_at": reset.expires_at.isoformat() if reset.expires_at else None,
    }


@router.post("/reset-password/{token}")
def set_password_with_token(
    token: str,
    payload: SetPasswordRequest,
    db: Session = Depends(get_db),
):
    reset = db.query(PasswordResetToken).filter(PasswordResetToken.token == token).first()
    if not reset:
        raise HTTPException(status_code=404, detail="Token not found")
    if reset.used_at:
        raise HTTPException(status_code=400, detail="Token already used")
    if reset.expires_at and reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expired")

    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    reset.user.hashed_password = get_password_hash(payload.password)
    reset.used_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "password_set"}
