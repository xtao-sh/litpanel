"""Simple API key authentication for external API access."""

from typing import Optional

from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader

from config import EXTERNAL_API_KEY

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


def get_api_key():
    """Load API key from environment. If not set, auth is disabled (local dev mode)."""
    return EXTERNAL_API_KEY


async def verify_api_key(
    request: Request, api_key: Optional[str] = Security(API_KEY_HEADER)
):
    """Verify API key for external endpoints. Skip if no key is configured (local dev)."""
    configured_key = get_api_key()
    if not configured_key:
        return  # No key configured = local dev mode, allow all
    if api_key != configured_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
