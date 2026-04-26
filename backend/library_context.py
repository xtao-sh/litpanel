"""Request-scoped active library selection."""

from __future__ import annotations

from contextvars import ContextVar, Token


_active_library_id: ContextVar[int | None] = ContextVar(
    "active_library_id",
    default=None,
)


def get_active_library_id() -> int | None:
    return _active_library_id.get()


def set_active_library_id(library_id: int | None) -> Token:
    return _active_library_id.set(library_id)


def reset_active_library_id(token: Token) -> None:
    _active_library_id.reset(token)
