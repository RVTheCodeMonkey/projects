from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    is_admin: bool

    class Config:
        from_attributes = True


class UserCreateAdmin(BaseModel):
    email: EmailStr
    is_admin: bool = False


class UserUpdateAdmin(BaseModel):
    is_admin: bool


class PasswordResetTokenResponse(BaseModel):
    email: str
    expires_at: str | None
