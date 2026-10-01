from pathlib import Path

import pytest

from catalog import FolderCatalog, normalize_barcode
from product import Product

ROOT = Path(__file__).resolve().parents[2] / "data" / "products"
YOGURT = "5901234123457"
COLA = "5449000000996"
MISSING = "0000000000000"


@pytest.fixture
def catalog() -> FolderCatalog:
    return FolderCatalog(ROOT)


def test_normalize_strips_spaces_and_rejects_junk() -> None:
    assert normalize_barcode(" 5901 2341 23457 ") == YOGURT
    assert normalize_barcode("../etc/passwd") is None
    assert normalize_barcode("abc") is None
    assert normalize_barcode("123") is None


def test_get_yogurt(catalog: FolderCatalog) -> None:
    product = catalog.get(YOGURT)
    assert product is not None
    assert product.name == "Meadow Fresh Greek Yogurt Plain"
    assert "protein 9.0 g" in product.nutrition
    assert "milk" in product.allergens.lower()


def test_unknown_barcode(catalog: FolderCatalog) -> None:
    assert catalog.get(MISSING) is None


def test_non_digit_junk_cannot_escape_catalog(catalog: FolderCatalog) -> None:
    assert catalog.get("..") is None
    assert catalog.get("/etc/passwd") is None
    product = catalog.get("foo/5901234123457")
    assert product is not None
    assert product.barcode == YOGURT


def test_search_protein(catalog: FolderCatalog) -> None:
    hit = catalog.search(YOGURT, "how much protein")
    assert "protein" in hit.lower()
    assert "9.0" in hit


def test_compact_card_stays_short(catalog: FolderCatalog) -> None:
    product = catalog.get(YOGURT)
    assert product is not None
    assert len(product.compact_card()) <= 1800


def test_cola_sugar_for_diabetes_question(catalog: FolderCatalog) -> None:
    product = catalog.get(COLA)
    assert product is not None
    assert "26.5 g" in product.nutrition
    notes = product.search("diabetes sugar")
    assert "diabetes" in notes.lower() or "sugars" in notes.lower()


def test_list_summaries_has_three_samples(catalog: FolderCatalog) -> None:
    names = {item["name"] for item in catalog.list_summaries()}
    assert "Meadow Fresh Greek Yogurt Plain" in names
    assert len(names) >= 3


def test_product_search_empty_query_returns_sections() -> None:
    product = Product(
        barcode="1",
        name="X",
        brand="Y",
        category="Z",
        net_weight="1g",
        serving="1g",
        nutrition="protein 1 g",
        ingredients="water",
        allergens="none",
        notes="",
    )
    assert "nutrition" in product.search("")
