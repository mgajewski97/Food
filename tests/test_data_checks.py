import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from scripts import check_alias_conflicts as cac
from scripts import validate_data as vd


def _write(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2))


def _conflict_products(tmp_path: Path) -> Path:
    data = {
        "categories": [
            {"id": "cat.a", "names": {"en": "A"}},
            {"id": "cat.b", "names": {"en": "B"}},
        ],
        "products": [
            {
                "id": "p1",
                "categoryId": "cat.a",
                "names": {"en": "P1", "pl": "P1"},
                "unitId": "u",
                "aliases": ["same"],
            },
            {
                "id": "p2",
                "categoryId": "cat.b",
                "names": {"en": "P2", "pl": "P2"},
                "unitId": "u",
                "aliases": ["same"],
            },
        ],
    }
    path = tmp_path / "products.json"
    _write(path, data)
    return path


def test_check_alias_conflicts(tmp_path, capsys):
    path = _conflict_products(tmp_path)
    cac.DATA_PATH = path

    code = cac.main([])
    out = capsys.readouterr().out
    assert code == 1
    assert "alias 'same'" in out

    # fix alias and ensure success
    data = json.loads(path.read_text())
    data["products"][1]["aliases"] = ["other"]
    _write(path, data)

    code = cac.main([])
    out = capsys.readouterr().out
    assert code == 0
    assert "No alias conflicts" in out


def _invalid_dataset(tmp_path: Path) -> None:
    products = {
        "categories": [{"id": "cat.a", "names": {"en": "A", "pl": "A"}}],
        "products": [
            {
                "id": "p1",
                "categoryId": "cat.a",
                "names": {"en": "P1", "pl": "P1"},
                "unitId": "u",
            },
            {
                "id": "p1",
                "categoryId": "cat.a",
                "names": {"en": "P2", "pl": "P2"},
                "unitId": "u",
            },
        ],
    }
    recipes = [
        {
            "id": "r1",
            "names": {"en": "R1", "pl": "R1"},
            "portions": 1,
            "time": "",
            "ingredients": [
                {"productId": "missing", "qty": 1, "unitId": "u", "optional": False}
            ],
            "steps": [],
            "tags": ["ok", 1],
        }
    ]
    units = [{"id": "u"}]
    _write(tmp_path / "products.json", products)
    _write(tmp_path / "recipes.json", recipes)
    _write(tmp_path / "units.json", units)


def _valid_dataset(tmp_path: Path) -> None:
    products = {
        "categories": [{"id": "cat.a", "names": {"en": "A", "pl": "A"}}],
        "products": [
            {
                "id": "p1",
                "categoryId": "cat.a",
                "names": {"en": "P1", "pl": "P1"},
                "unitId": "u",
            },
            {
                "id": "p2",
                "categoryId": "cat.a",
                "names": {"en": "P2", "pl": "P2"},
                "unitId": "u",
            },
        ],
    }
    recipes = [
        {
            "id": "r1",
            "names": {"en": "R1", "pl": "R1"},
            "portions": 1,
            "time": "",
            "ingredients": [
                {"productId": "p1", "qty": 1, "unitId": "u", "optional": False}
            ],
            "steps": [],
            "tags": ["ok"],
        }
    ]
    units = [{"id": "u"}]
    _write(tmp_path / "products.json", products)
    _write(tmp_path / "recipes.json", recipes)
    _write(tmp_path / "units.json", units)


def test_validate_data(tmp_path, capsys):
    _invalid_dataset(tmp_path)
    vd.DATA_DIR = tmp_path

    with pytest.raises(SystemExit) as exc:
        vd.main()
    assert exc.value.code == 1
    out = capsys.readouterr().out
    assert "duplicate product id" in out
    assert "unknown productId missing" in out
    assert "tag[1] not a string" in out

    _valid_dataset(tmp_path)
    vd.DATA_DIR = tmp_path
    vd.main()
    out = capsys.readouterr().out
    assert "OK" in out

