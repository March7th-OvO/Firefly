from pydantic import BaseModel, Field, field_validator


class PageContext(BaseModel):
    title: str | None = None
    url: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    session_id: str | None = None
    context: PageContext | None = None

    @field_validator("message")
    @classmethod
    def reject_blank_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must not be blank")
        return value
