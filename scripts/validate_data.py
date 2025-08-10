import json
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "app" / "data"

ERROR_PREFIX = "Błąd / Error"
OK_MESSAGE = "OK / OK"


def normalize_alias(alias: str) -> str:
    normalized = unicodedata.normalize("NFKD", alias)
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def validate_products(products_data):
    errors = []

    products = products_data.get("products", [])
    categories = {c.get("id") for c in products_data.get("categories", [])}
    units = {u.get("id") for u in products_data.get("units", [])}

    id_set = set()
    alias_map = {}

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
            errors.append(f"product[{idx}]: missing {', '.join(missing_fields)}")
            continue

        if prod_id in id_set:
            errors.append(f"duplicate product id: {prod_id}")
        else:
            id_set.add(prod_id)

        if category_id not in categories:
            errors.append(f"product {prod_id}: unknown categoryId {category_id}")
        if unit_id not in units:
            errors.append(f"product {prod_id}: unknown unitId {unit_id}")

        for alias in aliases:
            norm = normalize_alias(alias)
            if norm in alias_map and alias_map[norm] != prod_id:
                errors.append(
                    f"alias '{alias}' for {prod_id} duplicates alias for {alias_map[norm]}"
                )
            else:
                alias_map[norm] = prod_id

    return errors, id_set, alias_map, units, categories


def validate_recipes(recipes_data, product_ids, unit_ids, category_ids):
    errors = []

    for r_idx, recipe in enumerate(recipes_data):
        ingredients = recipe.get("ingredients", [])
        for i_idx, ing in enumerate(ingredients):
            product_id = ing.get("productId")
            unit_id = ing.get("unitId")
            category_id = ing.get("categoryId")

            if product_id and product_id not in product_ids:
                errors.append(
                    f"recipe[{r_idx}] ingredient[{i_idx}]: unknown productId {product_id}"
                )
            if unit_id and unit_id not in unit_ids:
                errors.append(
                    f"recipe[{r_idx}] ingredient[{i_idx}]: unknown unitId {unit_id}"
                )
            if category_id and category_id not in category_ids:
                errors.append(
                    f"recipe[{r_idx}] ingredient[{i_idx}]: unknown categoryId {category_id}"
                )

    return errors


def main():
    products_path = DATA_DIR / "products.json"
    recipes_path = DATA_DIR / "recipes.json"

    errors = []

    try:
        products_data = load_json(products_path)
    except Exception as e:
        errors.append(f"unable to load products.json: {e}")
        products_data = {}

    try:
        recipes_data = load_json(recipes_path)
    except Exception as e:
        errors.append(f"unable to load recipes.json: {e}")
        recipes_data = []

    p_errors, product_ids, alias_map, unit_ids, category_ids = validate_products(products_data)
    errors.extend(p_errors)

    r_errors = validate_recipes(recipes_data, product_ids, unit_ids, category_ids)
    errors.extend(r_errors)

    if errors:
        for err in errors:
            print(f"{ERROR_PREFIX}: {err}")
        sys.exit(1)
    else:
        print(OK_MESSAGE)


if __name__ == "__main__":
    main()
