import json
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "app" / "data"

ERROR_PREFIX = "Błąd / Error"
OK_MESSAGE = "OK / OK"


def normalize_alias(alias: str) -> str:
    normalized = unicodedata.normalize("NFKD", alias)
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def find_line(lines: List[str], needle: str) -> int:
    """Return 1-based line number of ``needle`` in ``lines`` or 0 if not found."""
    for idx, line in enumerate(lines, 1):
        if needle in line:
            return idx
    return 0


def validate_products(
    products_data: Dict[str, Any],
    unit_ids: Set[str],
    path: Path,
    lines: List[str],
) -> Tuple[List[str], Set[str], Dict[str, str], Set[str], Set[str]]:
    errors: List[str] = []

    products = products_data.get("products", [])
    categories = {c.get("id") for c in products_data.get("categories", [])}
    units = set(unit_ids)

    id_set: Set[str] = set()
    alias_map: Dict[str, str] = {}

    for idx, prod in enumerate(products):
        prod_id = prod.get("id")
        names = prod.get("names", {})
        aliases = prod.get("aliases", [])
        category_id = prod.get("categoryId")
        unit_id = prod.get("unitId")

        missing_fields = []
        if not prod_id:
            missing_fields.append("id")
        if not names.get("pl"):
            missing_fields.append("names.pl")
        if not names.get("en"):
            missing_fields.append("names.en")
        if not category_id:
            missing_fields.append("categoryId")
        if not unit_id:
            missing_fields.append("unitId")
        if missing_fields:
            line_no = find_line(lines, f'"id": "{prod_id}"') if prod_id else 0
            errors.append(
                f"{path}:{line_no}: product[{idx}]: missing {', '.join(missing_fields)}"
            )
            continue

        if prod_id in id_set:
            line_no = find_line(lines, f'"id": "{prod_id}"')
            errors.append(f"{path}:{line_no}: duplicate product id: {prod_id}")
        else:
            id_set.add(prod_id)

        if category_id not in categories:
            line_no = find_line(lines, f'"id": "{prod_id}"')
            errors.append(
                f"{path}:{line_no}: product {prod_id}: unknown categoryId {category_id}"
            )
        if unit_id not in units:
            line_no = find_line(lines, f'"id": "{prod_id}"')
            errors.append(
                f"{path}:{line_no}: product {prod_id}: unknown unitId {unit_id}"
            )

        for alias in aliases:
            norm = normalize_alias(alias)
            if norm in alias_map and alias_map[norm] != prod_id:
                line_no = find_line(lines, f'"id": "{prod_id}"')
                errors.append(
                    f"{path}:{line_no}: alias '{alias}' for {prod_id} duplicates alias for {alias_map[norm]}"
                )
            else:
                alias_map[norm] = prod_id

    return errors, id_set, alias_map, units, categories


def validate_recipes(
    recipes_data: List[Dict[str, Any]],
    product_ids: Set[str],
    unit_ids: Set[str],
    category_ids: Set[str],
    path: Path,
    lines: List[str],
) -> List[str]:
    errors: List[str] = []

    for r_idx, recipe in enumerate(recipes_data):
        ingredients = recipe.get("ingredients", [])
        for i_idx, ing in enumerate(ingredients):
            product_id = ing.get("productId")
            unit_id = ing.get("unitId")
            category_id = ing.get("categoryId")

            if product_id and product_id not in product_ids:
                line_no = find_line(lines, f'"productId": "{product_id}"')
                errors.append(
                    f"{path}:{line_no}: recipe[{r_idx}] ingredient[{i_idx}]: unknown productId {product_id}"
                )
            if unit_id and unit_id not in unit_ids:
                line_no = find_line(lines, f'"unitId": "{unit_id}"')
                errors.append(
                    f"{path}:{line_no}: recipe[{r_idx}] ingredient[{i_idx}]: unknown unitId {unit_id}"
                )
            if category_id and category_id not in category_ids:
                line_no = find_line(lines, f'"categoryId": "{category_id}"')
                errors.append(
                    f"{path}:{line_no}: recipe[{r_idx}] ingredient[{i_idx}]: unknown categoryId {category_id}"
                )

        tags = recipe.get("tags", [])
        if tags:
            tags_line = find_line(lines, '"tags"')
            for t_idx, tag in enumerate(tags):
                if not isinstance(tag, str):
                    errors.append(
                        f"{path}:{tags_line}: recipe[{r_idx}] tag[{t_idx}] not a string"
                    )

    return errors


def main() -> None:
    products_path = DATA_DIR / "products.json"
    recipes_path = DATA_DIR / "recipes.json"

    errors: List[str] = []

    try:
        products_text = products_path.read_text(encoding="utf-8")
        products_data = json.loads(products_text)
        products_lines = products_text.splitlines()
    except Exception as e:
        errors.append(f"unable to load products.json: {e}")
        products_data = {}
        products_lines = []

    try:
        recipes_text = recipes_path.read_text(encoding="utf-8")
        recipes_data = json.loads(recipes_text)
        recipes_lines = recipes_text.splitlines()
    except Exception as e:
        errors.append(f"unable to load recipes.json: {e}")
        recipes_data = []
        recipes_lines = []

    units_path = DATA_DIR / "units.json"
    try:
        units_data = load_json(units_path)
    except Exception as e:
        errors.append(f"unable to load units.json: {e}")
        units_data = []

    unit_ids_loaded = {u.get("id") for u in units_data}
    p_errors, product_ids, alias_map, unit_ids, category_ids = validate_products(
        products_data, unit_ids_loaded, products_path, products_lines
    )
    errors.extend(p_errors)

    r_errors = validate_recipes(
        recipes_data, product_ids, unit_ids, category_ids, recipes_path, recipes_lines
    )
    errors.extend(r_errors)

    if errors:
        for err in errors:
            print(f"{ERROR_PREFIX}: {err}")
        sys.exit(1)
    else:
        print(OK_MESSAGE)


if __name__ == "__main__":
    main()
