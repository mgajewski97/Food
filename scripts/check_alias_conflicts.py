import argparse
import json
import sys
import unicodedata
from pathlib import Path
from typing import Dict, Iterable, Set, Tuple

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "app" / "data" / "products.json"


def _normalize(text: str) -> str:
    """Normalize alias by lowercasing and stripping diacritics."""
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def find_conflicts(
    products: Iterable[Dict[str, object]]
) -> Dict[str, Dict[Tuple[str | None, str | None], Set[str]]]:
    """Return mapping of normalized alias -> (category, storage) -> product ids.

    An alias is considered conflicting if it appears in more than one
    category/storage pair. This allows detecting cases where the same shorthand
    points to products that would fall into different categories or storage
    locations.
    """

    mapping: Dict[str, Dict[Tuple[str | None, str | None], Set[str]]] = {}
    for prod in products:
        pid = prod.get("id")  # type: ignore[assignment]
        category = prod.get("categoryId")  # type: ignore[assignment]
        storage = prod.get("storage")  # type: ignore[assignment]
        for alias in prod.get("aliases", []) or []:  # type: ignore[assignment]
            norm = _normalize(alias)
            if not norm:
                continue
            key = (category, storage)
            mapping.setdefault(norm, {}).setdefault(key, set()).add(
                pid  # type: ignore[arg-type]
            )

    return {a: groups for a, groups in mapping.items() if len(groups) > 1}


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check for conflicting product aliases"
    )
    parser.parse_args(argv)

    if not DATA_PATH.exists():
        print(f"products.json not found at {DATA_PATH}")
        return 1

    with DATA_PATH.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    products = data.get("products", [])

    conflicts = find_conflicts(products)
    if conflicts:
        print("Alias conflicts detected:")
        for alias, groups in sorted(conflicts.items()):
            print(f"  alias '{alias}' is used by:")
            for (cat, storage), ids in sorted(groups.items()):
                id_list = ", ".join(sorted(ids))
                details: list[str] = []
                if cat:
                    details.append(f"category {cat}")
                if storage:
                    details.append(f"storage {storage}")
                detail_str = f" ({', '.join(details)})" if details else ""
                print(f"    {id_list}{detail_str}")
            print("    Suggestion: drop or reassign the alias.")
        return 1
    else:
        print("No alias conflicts found.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
