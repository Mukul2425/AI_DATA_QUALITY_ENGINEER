from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_byte_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer")
        return value


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
