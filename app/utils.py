"""Utility helpers for JSON storage, validation and product normalization."""

# CHANGELOG:
# - Corrected list validation to check items against schema definitions.

import json
import logging
import os
from typing import Any, Dict, Optional, Tuple, List, Callable

import jsonschema

DEFAULT_UNIT = "szt"

logger = logging.getLogger(__name__)

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


def normalize_recipe(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return recipe dict with sanitized ingredient entries."""
    recipe = dict(data)
    ingredients = recipe.get("ingredients", [])
    if isinstance(ingredients, list):
        cleaned: List[Any] = []
        for ing in ingredients:
            if isinstance(ing, dict):
                cleaned.append(
                    {
                        "product": ing.get("product"),
                        "quantity": _safe_float(ing.get("quantity", 0)),
                        "unit": ing.get("unit", DEFAULT_UNIT),
                    }
                )
            else:
                cleaned.append(ing)
        recipe["ingredients"] = cleaned
    return recipe

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
        logger.warning("%s: %s", os.path.basename(path), err)
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
        logger.warning("%s: %s", os.path.basename(path), err)
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
