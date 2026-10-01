from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

from product import Product

_BARCODE = re.compile(r"^[0-9]{8,14}$")
_META_LINE = re.compile(r"^([a-z_]+)\s*:\s*(.*)$", re.IGNORECASE)


def default_catalog_dir() -> Path:
    env = os.environ.get("CATALOG_DIR")
    if env:
        return Path(env).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / "data" / "products"


def normalize_barcode(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if not _BARCODE.fullmatch(digits):
        return None
    return digits


class FolderCatalog:
    """Filesystem catalog. Swap this class later for a vector store; keep the same methods."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or default_catalog_dir()).resolve()

    def _product_dir(self, barcode: str) -> Path | None:
        code = normalize_barcode(barcode)
        if code is None:
            return None
        path = (self.root / code).resolve()
        if not path.is_dir():
            return None
        try:
            path.relative_to(self.root)
        except ValueError:
            return None
        return path

    def get(self, barcode: str) -> Product | None:
        folder = self._product_dir(barcode)
        if folder is None:
            return None
        meta = _parse_meta(folder / "meta.txt")
        return Product(
            barcode=folder.name,
            name=meta.get("name") or folder.name,
            brand=meta.get("brand") or "",
            category=meta.get("category") or "",
            net_weight=meta.get("net_weight") or "",
            serving=meta.get("serving") or "",
            nutrition=_read(folder / "nutrition.txt"),
            ingredients=_read(folder / "ingredients.txt"),
            allergens=_read(folder / "allergens.txt"),
            notes=_read(folder / "notes.txt"),
        )

    def search(self, barcode: str, query: str) -> str:
        product = self.get(barcode)
        if product is None:
            return "No product is on file for that barcode."
        return product.search(query)

    def list_summaries(self) -> list[dict[str, str]]:
        if not self.root.is_dir():
            return []
        items: list[dict[str, str]] = []
        for child in sorted(self.root.iterdir()):
            if not child.is_dir() or not _BARCODE.fullmatch(child.name):
                continue
            product = self.get(child.name)
            if product:
                items.append(
                    {
                        "barcode": product.barcode,
                        "name": product.name,
                        "brand": product.brand,
                        "category": product.category,
                    }
                )
        return items


def _read(path: Path) -> str:
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()


def _parse_meta(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        match = _META_LINE.match(line.strip())
        if match:
            out[match.group(1).lower()] = match.group(2).strip()
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Look up a product folder by barcode")
    parser.add_argument("--ean", required=True)
    args = parser.parse_args(argv)
    product = FolderCatalog().get(args.ean)
    if product is None:
        print(f"not found: {args.ean}", file=sys.stderr)
        return 1
    print(product.compact_card())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
