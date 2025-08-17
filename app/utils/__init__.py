"""Utility helpers for JSON storage, validation and product normalization."""

# FIX: 2024-05-06

# CHANGELOG:
# - Corrected list validation to check items against schema definitions.

import json
import logging
import math
import os
import threading
import hashlib
from datetime import datetime, timezone
from email.utils import format_datetime
from typing import Any, Callable, Dict, List, Optional, Tuple

import jsonschema

from ..errors import DomainError

DEFAULT_UNIT = "szt"

logger = logging.getLogger(__name__)


# --- Domain lookup helpers ---------------------------------------------------

_DOMAIN_PRODUCTS: Dict[str, Dict[str, Any]] = {}
_ALIAS_TO_ID: Dict[str, str] = {}
_DOMAIN_LOCK = threading.Lock()

_UNIT_TEXT_MAP = {
    "pcs": DEFAULT_UNIT,
    "pc": DEFAULT_UNIT,
    "piece": DEFAULT_UNIT,
    "pieces": DEFAULT_UNIT,
    "szt": DEFAULT_UNIT,
    "g": "g",
    "gram": "g",
    "grams": "g",
    "kg": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "ml": "ml",
    "milliliter": "ml",
    "millilitre": "ml",
    "milliliters": "ml",
    "millilitres": "ml",
    "l": "l",
    "liter": "l",
    "litre": "l",
    "liters": "l",
    "litres": "l",
    "lvl": "lvl",
}

_TAG_CATEGORY_MAP = {
    "spice": "spices",
    "spices": "spices",
    "herb": "spices",
}


def _normalize_alias(alias: str) -> str:
    """Return canonical form for product aliases."""
    import unicodedata

    normalized = unicodedata.normalize("NFKD", alias)
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def _load_domain_data() -> None:
    """Load domain products and aliases once into memory."""

    if _DOMAIN_PRODUCTS:
        return
    with _DOMAIN_LOCK:
        if _DOMAIN_PRODUCTS:
            return
        from .product_io import load_products_nested

        data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        products_path = os.path.join(data_dir, "products.json")
        try:
            products = load_products_nested(products_path)
        except Exception:  # pragma: no cover - defensive
            products = []
        for prod in products:
            prod_id = prod.get("id") or prod.get("name")
            if not prod_id:
                continue
    if "names" not in prod and prod.get("name"):
        prod["names"] = {"pl": prod["name"], "en": prod["name"]}
    _DOMAIN_PRODUCTS[prod_id] = prod
    for alias in prod.get("aliases", []):
        _ALIAS_TO_ID[_normalize_alias(alias)] = prod_id
    _ALIAS_TO_ID.setdefault(_normalize_alias(prod_id), prod_id)


def resolve_alias(alias: str) -> Optional[str]:
    """Return product id for ``alias`` if known."""
    if not alias:
        return None
    _load_domain_data()
    return _ALIAS_TO_ID.get(_normalize_alias(alias))


def resolve_id_name(prod_id: str, locale: str = "pl") -> Optional[str]:
    """Return localized name for ``prod_id`` if known."""
    if not prod_id:
        return None
    _load_domain_data()
    prod = _DOMAIN_PRODUCTS.get(prod_id)
    if not prod:
        return None
    names = prod.get("names", {})
    return names.get(locale) or names.get("pl") or names.get("en")


def _normalize_unit(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = str(value).strip().lower()
    if value.startswith("unit."):
        value = value[5:]
    return _UNIT_TEXT_MAP.get(value, value)


def _normalize_category(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = str(value).strip().lower()
    if value.startswith("category."):
        value = value[9:]
    return value or None


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return default


def file_etag(path: str) -> str:
    """Return SHA256 hex digest for the file at ``path``.

    The ETag is stable for a given file content and can be used for HTTP
    caching. The file is read in binary mode to ensure the hash reflects the
    exact bytes served.
    """

    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def file_mtime_rfc1123(path: str) -> str:
    """Return the file modification time formatted per RFC1123."""

    ts = os.path.getmtime(path)
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return format_datetime(dt, usegmt=True)


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
            item_errors = sorted(
                validator_to_use.iter_errors(item), key=lambda e: e.path
            )
            if item_errors:
                for err in item_errors:
                    path = ".".join(str(p) for p in err.path)
                    errors.append(
                        f"item {idx}{('.' + path) if path else ''}: {err.message}"
                    )
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


def validate_payload(payload: Any, schema_name: str) -> Any:
    """Validate a request payload against a named schema.

    Args:
        payload: JSON-decoded data from the client.
        schema_name: Filename of the schema located in ``app/schemas``.

    Returns:
        The original payload if validation succeeds.

    Raises:
        DomainError: If validation fails or the schema is missing.
    """

    schema_dir = os.path.join(os.path.dirname(__file__), "..", "schemas")
    schema_path = os.path.join(schema_dir, schema_name)
    schema = _load_schema(schema_path)
    if schema is None:
        raise DomainError(f"schema {schema_name} not found")
    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: e.path)
    if errors:
        err = errors[0]
        path = ".".join(str(p) for p in err.path) or "(root)"
        raise DomainError(f"{path}: {err.message}")
    return payload


def normalize_product(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a product dict ensuring core fields are never empty.

    Normalization order for missing ``name``/``unit``/``category``:

    1.  Resolve ``productId`` in bundled domain data and copy canonical
        attributes.
    2.  Resolve ``alias`` against the same domain maps.
    3.  Map free-text unit names and tag based category hints.
    4.  Apply conservative defaults (``"Unknown"``, ``DEFAULT_UNIT``,
        ``"uncategorized"``).

    Numeric and boolean fields are coerced from strings and lists are wrapped
    appropriately.  The function operates on a shallow copy of ``data`` and
    returns a minimal structure accepted by the product schema.
    """

    _load_domain_data()
    obj = dict(data)

    prod_id = obj.get("productId") or obj.get("id")
    domain_prod = _DOMAIN_PRODUCTS.get(prod_id) if prod_id else None

    # --- name -----------------------------------------------------------------
    name = obj.get("name")
    if not name:
        if domain_prod:
            names = domain_prod.get("names", {})
            name = names.get("pl") or names.get("en") or prod_id
        if not name:
            alias = obj.get("alias")
            if not alias:
                aliases = obj.get("aliases")
                if isinstance(aliases, list) and aliases:
                    alias = aliases[0]
            if alias:
                pid = _ALIAS_TO_ID.get(_normalize_alias(alias))
                if pid:
                    dp = _DOMAIN_PRODUCTS.get(pid, {})
                    names = dp.get("names", {})
                    name = names.get("pl") or names.get("en") or pid
                    domain_prod = dp
        if not name:
            name = "Unknown"

    # --- unit -----------------------------------------------------------------
    unit = _normalize_unit(obj.get("unit") or obj.get("unitId"))
    if not unit and domain_prod:
        unit = _normalize_unit(domain_prod.get("unitId"))
    if not unit:
        unit = DEFAULT_UNIT

    # --- category -------------------------------------------------------------
    category = _normalize_category(obj.get("category") or obj.get("categoryId"))
    if not category and domain_prod:
        category = _normalize_category(domain_prod.get("categoryId"))
    if not category:
        raw_tags = obj.get("tags")
        tags: List[str]
        if isinstance(raw_tags, list):
            tags = [str(t).lower() for t in raw_tags if isinstance(t, str)]
        elif isinstance(raw_tags, str):
            tags = [raw_tags.lower()]
        else:
            tags = []
        for tag in tags:
            mapped = _TAG_CATEGORY_MAP.get(tag)
            if mapped:
                category = mapped
                break
    if not category:
        category = "uncategorized"

    storage = obj.get("storage") or "pantry"

    # --- numeric fields -------------------------------------------------------
    quantity = max(0.0, _safe_float(obj.get("quantity")))
    threshold = max(0.0, _safe_float(obj.get("threshold")))
    package_size = obj.get("package_size")
    package_size = (
        max(0.0, _safe_float(package_size)) if package_size not in (None, "") else None
    )
    pack_size = obj.get("pack_size")
    pack_size = (
        max(0.0, _safe_float(pack_size)) if pack_size not in (None, "") else None
    )

    # --- booleans -------------------------------------------------------------
    main = _coerce_bool(obj.get("main"), True)
    is_spice = _coerce_bool(obj.get("is_spice")) or category == "spices"

    # --- tags -----------------------------------------------------------------
    tags = obj.get("tags")
    if isinstance(tags, list):
        tags = [str(t) for t in tags if isinstance(t, str)]
    elif isinstance(tags, str):
        tags = [tags]
    else:
        tags = []

    level = obj.get("level")
    if is_spice:
        if level not in {"none", "low", "medium", "high"}:
            if quantity <= 0:
                level = "none"
            elif quantity == 1:
                level = "low"
            else:
                level = "medium"
        return {
            "name": name,
            "quantity": 0,
            "unit": unit,
            "category": "spices",
            "storage": storage,
            "threshold": 1,
            "main": True,
            "package_size": package_size if package_size is not None else 1,
            "pack_size": pack_size,
            "tags": tags,
            "level": level,
            "is_spice": True,
        }

    level = level if level in {"none", "low", "medium", "high"} else None
    return {
        "name": name,
        "quantity": quantity,
        "unit": unit,
        "category": category,
        "storage": storage,
        "threshold": threshold,
        "main": main,
        "package_size": package_size if package_size is not None else 1,
        "pack_size": pack_size,
        "tags": tags,
        "level": level,
        "is_spice": False,
    }


def normalize_recipe(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return recipe dict with defaults and cleaned ingredients."""

    def _clean_list(items: List[Any]) -> List[Dict[str, Any]]:
        cleaned: List[Dict[str, Any]] = []
        for ing in items:
            if isinstance(ing, dict):
                obj: Dict[str, Any] = {
                    "productId": ing.get("productId"),
                    "qty": max(0.0, _safe_float(ing.get("qty", 0))),
                    "unitId": ing.get("unitId"),
                    "optional": bool(ing.get("optional", False)),
                }
                if ing.get("note") is not None:
                    obj["note"] = ing["note"]
                if ing.get("unresolved"):
                    obj["unresolved"] = True
                cleaned.append(obj)
            else:
                cleaned.append(
                    {
                        "productId": None,
                        "qty": 0,
                        "unitId": None,
                        "optional": False,
                        "note": str(ing),
                        "unresolved": True,
                    }
                )
        return cleaned

    recipe = {
        "id": data.get("id"),
        "names": {
            "pl": data.get("names", {}).get("pl", ""),
            "en": data.get("names", {}).get("en", ""),
        },
        "portions": max(1.0, _safe_float(data.get("portions", 1), 1)) or 1,
        "time": str(data.get("time", "")),
        "ingredients": _clean_list(data.get("ingredients", [])),
        "steps": [str(s) for s in data.get("steps", []) if isinstance(s, str)],
        "tags": [str(t) for t in data.get("tags", []) if isinstance(t, str)],
    }
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
    path: str,
    schema_path: str,
    *,
    normalize: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
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
            raise ValueError(f"{os.path.basename(path)}[{idx}].{field}: {err.message}")
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
    if schema_path and os.path.basename(schema_path) == "product.schema.json":
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
        except (FileNotFoundError, json.JSONDecodeError):
            raw = default
        if isinstance(raw, list):
            if coerce:
                raw = [coerce(d) for d in raw]
            from .validators import validate_products
            errors = validate_products(raw)
            return len(raw), errors
        else:
            from ..validators import validate_products

            flat = []
            if isinstance(raw, dict):
                for storage, cats in raw.items():
                    if not isinstance(cats, dict):
                        continue
                    for category, items in cats.items():
                        if not isinstance(items, list):
                            continue
                        for item in items:
                            if not isinstance(item, dict):
                                continue
                            obj = dict(item)
                            obj["storage"] = storage
                            obj["category"] = category
                            flat.append(obj)
            if coerce:
                flat = [coerce(p) for p in flat]
            errors = validate_products(flat)
            return len(flat), errors
    data, errors = load_json(path, default, schema_path, coerce, return_errors=True)
    count = len(data) if isinstance(data, list) else (1 if data is not None else 0)
    return count, errors
