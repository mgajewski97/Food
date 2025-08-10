"""Utility helpers for JSON storage, validation and product normalization."""

# FIX: 2024-05-06

# CHANGELOG:
# - Corrected list validation to check items against schema definitions.

import json
import logging
import os
import threading
from typing import Any, Callable, Dict, List, Optional, Tuple
import math

import jsonschema

DEFAULT_UNIT = "szt"

logger = logging.getLogger(__name__)

def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convert value to float or return default on failure."""
    try:
        val = float(value)
        if not math.isfinite(val):
            return default
        return val
    except (TypeError, ValueError):
        return default

def _load_schema(schema_path: str) -> Optional[Dict[str, Any]]:
    """Load JSON schema from path if it exists."""
    try:
        with open(schema_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def _validate(
    data: Any,
    schema_path: Optional[str] = None,
    *,
    coerce: Optional[Callable[[Any], Any]] = None,
) -> Tuple[Any, List[str]]:
    """Validate data against schema returning cleaned data and errors.

    If the root is a list, invalid entries are skipped. When ``coerce`` is
    provided it is applied to each element before validation, allowing for
    backward-compatible coercion of values.
    """

    if schema_path:
        schema = _load_schema(schema_path)
    else:
        schema = None

    if coerce and isinstance(data, list):
        data = [coerce(d) for d in data]
    elif coerce and data is not None:
        data = coerce(data)

    if not schema:
        return data, []

    validator = jsonschema.Draft7Validator(schema)
    item_validator = None
    if schema.get("type") == "array" and "items" in schema:
        item_validator = jsonschema.Draft7Validator(schema["items"])
    errors: List[str] = []

    if isinstance(data, list):
        valid_items = []
        for idx, item in enumerate(data):
            validator_to_use = item_validator or validator
            item_errors = sorted(validator_to_use.iter_errors(item), key=lambda e: e.path)
            if item_errors:
                for err in item_errors:
                    path = ".".join(str(p) for p in err.path)
                    errors.append(f"item {idx}{('.' + path) if path else ''}: {err.message}")
            else:
                valid_items.append(item)
        return valid_items, errors

    item_errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    if item_errors:
        for err in item_errors:
            path = ".".join(str(p) for p in err.path)
            errors.append(f"{path}: {err.message}")
        return None, errors

    return data, []

def normalize_product(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return product dict with defaults and sanitized numeric fields."""
    pack = data.get("pack_size")
    category = data.get("category", "uncategorized")
    is_spice = data.get("is_spice") is True or category == "spices"
    quantity = _safe_float(data.get("quantity", 0))
    level = data.get("level")
    if is_spice:
        if level not in {"none", "low", "medium", "high"}:
            if quantity <= 0:
                level = "none"
            elif quantity == 1:
                level = "low"
            else:
                level = "medium"
        return {
            "name": data.get("name"),
            "quantity": 0,
            "unit": data.get("unit", DEFAULT_UNIT),
            "category": "spices",
            "storage": data.get("storage", "pantry"),
            "threshold": 1,
            "main": True,
            "package_size": _safe_float(data.get("package_size", 1), 1),
            "pack_size": _safe_float(pack) if pack is not None else None,
            "tags": [str(t) for t in data.get("tags", []) if isinstance(t, str)],
            "level": level,
            "is_spice": True,
        }
    return {
        "name": data.get("name"),
        "quantity": quantity,
        "unit": data.get("unit", DEFAULT_UNIT),
        "category": category,
        "storage": data.get("storage", "pantry"),
        "threshold": _safe_float(data.get("threshold", 1), 1) or 1,
        "main": bool(data.get("main", True)),
        "package_size": _safe_float(data.get("package_size", 1), 1),
        "pack_size": _safe_float(pack) if pack is not None else None,
        "tags": [str(t) for t in data.get("tags", []) if isinstance(t, str)],
        "level": level if level in {"none", "low", "medium", "high"} else None,
        "is_spice": False,
    }


def normalize_recipe(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return recipe dict with defaults and cleaned ingredients."""
    def _clean_list(items: List[Any]) -> List[Dict[str, Any]]:
        cleaned: List[Dict[str, Any]] = []
        for ing in items:
            if isinstance(ing, dict):
                cleaned.append(
                    {
                        "product": ing.get("product"),
                        "quantity": _safe_float(ing.get("quantity", 0)),
                        "unit": ing.get("unit", DEFAULT_UNIT),
                    }
                )
            else:
                cleaned.append(
                    {
                        "product": ing,
                        "quantity": 0,
                        "unit": DEFAULT_UNIT,
                    }
                )
        return cleaned

    recipe = {
        "name": data.get("name"),
        "portions": _safe_float(data.get("portions", 1), 1) or 1,
        "time": str(data.get("time", "")),
        "ingredients": _clean_list(data.get("ingredients", [])),
        "steps": [str(s) for s in data.get("steps", []) if isinstance(s, str)],
        "tags": [str(t) for t in data.get("tags", []) if isinstance(t, str)],
    }
    optional = data.get("optionalIngredients") or []
    if optional:
        recipe["optionalIngredients"] = _clean_list(optional)
    return recipe


# --- Concurrency primitives -------------------------------------------------

_LOCKS: Dict[str, threading.Lock] = {}


def file_lock(path: str) -> threading.Lock:
    """Return a lock object for the given file path."""
    abs_path = os.path.abspath(path)
    lock = _LOCKS.get(abs_path)
    if lock is None:
        lock = threading.Lock()
        _LOCKS[abs_path] = lock
    return lock


# --- Validation & IO helpers -------------------------------------------------

def load_json_validated(
    path: str, schema_path: str, *, normalize: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """Load JSON file, normalize entries and validate against schema."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{os.path.basename(path)}: root is not an array")
    schema = _load_schema(schema_path) or {}
    validator = jsonschema.Draft7Validator(schema.get("items", schema))
    result: List[Dict[str, Any]] = []
    for idx, raw in enumerate(data):
        item = normalize(raw) if normalize else raw
        errors = sorted(validator.iter_errors(item), key=lambda e: e.path)
        if errors:
            err = errors[0]
            field = ".".join(str(p) for p in err.path) or "(root)"
            raise ValueError(
                f"{os.path.basename(path)}[{idx}].{field}: {err.message}"
            )
        result.append(item)
    return result


def validate_items(items: List[Dict[str, Any]], schema_path: str) -> None:
    """Validate list of items against schema raising ValueError on failure."""
    schema = _load_schema(schema_path) or {}
    validator = jsonschema.Draft7Validator(schema.get("items", schema))
    for idx, item in enumerate(items):
        errors = sorted(validator.iter_errors(item), key=lambda e: e.path)
        if errors:
            err = errors[0]
            field = ".".join(str(p) for p in err.path) or "(root)"
            raise ValueError(f"item {idx}.{field}: {err.message}")


def safe_write(path: str, data: Any) -> None:
    """Atomically persist JSON data to path."""
    tmp = f"{path}.tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def load_json(
    path: str,
    default: Any,
    schema_path: Optional[str] = None,
    coerce: Optional[Callable[[Any], Any]] = None,
    *,
    return_errors: bool = False,
) -> Any:
    """Load JSON from path returning default when missing or invalid."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = default
    validated, errors = _validate(data, schema_path, coerce=coerce)
    for err in errors:
        logger.info("%s: %s", os.path.basename(path), err)
    if return_errors:
        return validated if validated is not None else default, errors
    return validated if validated is not None else default

def save_json(
    path: str,
    data: Any,
    schema_path: Optional[str] = None,
    coerce: Optional[Callable[[Any], Any]] = None,
) -> None:
    """Persist JSON data to path creating directories when necessary."""
    validated, errors = _validate(data, schema_path, coerce=coerce)
    for err in errors:
        logger.info("%s: %s", os.path.basename(path), err)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(validated, f, ensure_ascii=False, indent=2)


def validate_file(
    path: str,
    default: Any,
    schema_path: Optional[str],
    coerce: Optional[Callable[[Any], Any]] = None,
) -> Tuple[int, List[str]]:
    """Validate file returning number of valid entries and list of errors."""
    data, errors = load_json(
        path, default, schema_path, coerce, return_errors=True
    )
    count = len(data) if isinstance(data, list) else (1 if data is not None else 0)
    return count, errors
