"""
PDF text extraction utilities.
Uses local PDF text extraction tools and caches extracted text next to the PDF.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

try:
    from PyPDF2 import PdfReader
except ImportError:  # pragma: no cover - exercised when the backend venv is minimal
    PdfReader = None


CACHE_VERSION = 1
TEXT_CACHE_DIR = "_text"


def _require_pdf(pdf_path: Path) -> Path:
    pdf_path = Path(pdf_path).expanduser()
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    return pdf_path


def _cache_dir(pdf_path: Path) -> Path:
    return pdf_path.parent / TEXT_CACHE_DIR


def _cache_paths(pdf_path: Path, kind: str) -> tuple[Path, Path]:
    cache_dir = _cache_dir(pdf_path)
    cache_path = cache_dir / f"{pdf_path.stem}.{kind}.txt"
    return cache_path, cache_path.with_suffix(cache_path.suffix + ".meta.json")


def _source_signature(pdf_path: Path) -> dict[str, Any]:
    stat = pdf_path.stat()
    return {
        "source": str(pdf_path.resolve()),
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
    }


def _read_valid_cache(
    pdf_path: Path,
    kind: str,
    params: dict[str, Any],
) -> str | None:
    cache_path, meta_path = _cache_paths(pdf_path, kind)
    if not cache_path.exists() or not meta_path.exists():
        return None
    try:
        meta = json.loads(meta_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None

    expected = {
        "cache_version": CACHE_VERSION,
        "kind": kind,
        "params": params,
        "source": _source_signature(pdf_path),
    }
    if meta != expected:
        return None
    return cache_path.read_text()


def _write_cache(
    pdf_path: Path,
    kind: str,
    params: dict[str, Any],
    text: str,
) -> Path:
    cache_path, meta_path = _cache_paths(pdf_path, kind)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(text)
    meta_path.write_text(
        json.dumps(
            {
                "cache_version": CACHE_VERSION,
                "kind": kind,
                "params": params,
                "source": _source_signature(pdf_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return cache_path


def _extract_with_pdftotext(pdf_path: Path, page_args: list[str] | None = None) -> str:
    if not shutil.which("pdftotext"):
        raise RuntimeError("pdftotext is not available and PyPDF2 is not installed")
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        cmd = ["pdftotext", "-layout", *(page_args or []), str(pdf_path), str(tmp_path)]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        return tmp_path.read_text(errors="ignore")
    finally:
        tmp_path.unlink(missing_ok=True)


def _extract_pages_uncached(pdf_path: Path, first_n: int, last_n: int) -> str:
    if PdfReader is None:
        first_text = _extract_with_pdftotext(pdf_path, ["-f", "1", "-l", str(first_n)])
        # `pdftotext` needs the real page count for a tail range; use `pdfinfo`
        # when available and otherwise fall back to the first pages only.
        total_pages = None
        if shutil.which("pdfinfo"):
            info = subprocess.run(["pdfinfo", str(pdf_path)], capture_output=True, text=True, check=False)
            for line in info.stdout.splitlines():
                if line.startswith("Pages:"):
                    try:
                        total_pages = int(line.split(":", 1)[1].strip())
                    except ValueError:
                        total_pages = None
                    break
        if total_pages and total_pages > first_n:
            start = max(first_n + 1, total_pages - last_n + 1)
            tail_text = _extract_with_pdftotext(pdf_path, ["-f", str(start), "-l", str(total_pages)])
            return "\n\n".join(part for part in [first_text, tail_text] if part.strip())
        return first_text

    reader = PdfReader(str(pdf_path))
    total = len(reader.pages)

    if total <= first_n + last_n:
        page_indices = list(range(total))
    else:
        page_indices = list(range(first_n)) + list(range(total - last_n, total))

    parts = []
    for i in page_indices:
        text = reader.pages[i].extract_text()
        if text:
            parts.append(f"--- Page {i + 1}/{total} ---\n{text}")

    return "\n\n".join(parts)


def _extract_full_text_uncached(pdf_path: Path, max_pages: int) -> str:
    if PdfReader is None:
        return _extract_with_pdftotext(pdf_path, ["-f", "1", "-l", str(max_pages)])

    reader = PdfReader(str(pdf_path))
    total = min(len(reader.pages), max_pages)

    parts = []
    for i in range(total):
        text = reader.pages[i].extract_text()
        if text:
            parts.append(text)

    return "\n\n".join(parts)


def extract_pages(pdf_path, first_n: int = 3, last_n: int = 2, use_cache: bool = True) -> str:
    """
    Extract text from the first N and last N pages of a PDF.
    Used by Scout for quick triage.
    """
    pdf_path = _require_pdf(Path(pdf_path))
    kind = f"scout-f{first_n}-l{last_n}"
    params = {"first_n": first_n, "last_n": last_n}
    if use_cache:
        cached = _read_valid_cache(pdf_path, kind, params)
        if cached is not None:
            return cached

    text = _extract_pages_uncached(pdf_path, first_n, last_n)
    if use_cache:
        _write_cache(pdf_path, kind, params, text)
    return text


def extract_full_text(pdf_path, max_pages: int = 80, use_cache: bool = True) -> str:
    """
    Extract full text from a PDF. Used by Reader for deep analysis.
    Caps at max_pages to avoid extremely long papers overwhelming context.
    """
    pdf_path = _require_pdf(Path(pdf_path))
    kind = f"full-m{max_pages}"
    params = {"max_pages": max_pages}
    if use_cache:
        cached = _read_valid_cache(pdf_path, kind, params)
        if cached is not None:
            return cached

    text = _extract_full_text_uncached(pdf_path, max_pages)
    if use_cache:
        _write_cache(pdf_path, kind, params, text)
    return text


def ensure_text_cache(
    pdf_path,
    *,
    first_n: int = 3,
    last_n: int = 2,
    max_pages: int = 80,
    include_full: bool = False,
) -> dict[str, Any]:
    """Create text cache files for a PDF and return their paths and sizes."""
    pdf_path = _require_pdf(Path(pdf_path))
    scout_text = extract_pages(pdf_path, first_n=first_n, last_n=last_n, use_cache=True)
    scout_path, _ = _cache_paths(pdf_path, f"scout-f{first_n}-l{last_n}")
    result: dict[str, Any] = {
        "scout_text_path": str(scout_path),
        "scout_chars": len(scout_text),
    }

    if include_full:
        full_text = extract_full_text(pdf_path, max_pages=max_pages, use_cache=True)
        full_path, _ = _cache_paths(pdf_path, f"full-m{max_pages}")
        result["full_text_path"] = str(full_path)
        result["full_chars"] = len(full_text)

    return result
