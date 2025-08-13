import argparse
import json
import sys
import unicodedata
from pathlib import Path
from typing import Dict, Iterable, Set

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "app" / "data" / "products.json"


def _normalize(text: str) -> str:
    """Normalize alias by lowercasing and stripping diacritics."""
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def find_conflicts(products: Iterable[Dict[str, object]]) -> Dict[str, Set[str]]:
    """Return mapping of normalized alias -> set of product ids."""
    mapping: Dict[str, Set[str]] = {}
    for prod in products:
        pid = prod.get("id")  # type: ignore[assignment]
        for alias in prod.get("aliases", []) or []:  # type: ignore[assignment]
            norm = _normalize(alias)
            if not norm:
                continue
            mapping.setdefault(norm, set()).add(pid)  # type: ignore[arg-type]
    conflicts = {a: ids for a, ids in mapping.items() if len(ids) > 1}
    return conflicts


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check for conflicting product aliases"
    )
    parser.add_argument(
        "--strict", action="store_true", help="exit with error on conflicts"
    )
    args = parser.parse_args(argv)

    if not DATA_PATH.exists():
        print(f"products.json not found at {DATA_PATH}")
        return 1

    with DATA_PATH.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    products = data.get("products", [])

    conflicts = find_conflicts(products)
    if conflicts:
        print("Alias conflicts detected:")
        for alias, ids in sorted(conflicts.items()):
            id_list = ", ".join(sorted(ids))
            print(f"  alias '{alias}' used by: {id_list}")
            print("    Suggestion: drop or reassign the alias.")
        if args.strict:
            return 1
    else:
        print("No alias conflicts found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
