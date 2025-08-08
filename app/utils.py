"""Utility functions for JSON storage and product normalization."""
import json
import os
from typing import Any, Dict, Optional

DEFAULT_UNIT = "szt"

def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convert value to float or return default on failure."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def _safe_int(value: Any) -> Optional[int]:
    """Convert value to int if possible."""
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None

def normalize_product(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return product dict with defaults and sanitized numeric fields."""
    return {
        "name": data.get("name"),
        "unit": data.get("unit", DEFAULT_UNIT),
        "quantity": _safe_float(data.get("quantity", 0)),
        "package_size": _safe_float(data.get("package_size", 1)) or 1,
        "pack_size": _safe_int(data.get("pack_size")),
        "threshold": _safe_float(data.get("threshold", 1)) or 1,
        "main": bool(data.get("main", True)),
        "category": data.get("category", "uncategorized"),
        "storage": data.get("storage", "pantry"),
    }

def load_json(path: str, default: Any) -> Any:
    """Load JSON from path returning default when missing or invalid."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default

def save_json(path: str, data: Any) -> None:
    """Persist JSON data to path creating directories when necessary."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
