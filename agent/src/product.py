from __future__ import annotations

from dataclasses import dataclass

# GPT-Live append_thinking / append_commentary cap is 500 tokens (~2k chars).
_CARD_LIMIT = 1800


@dataclass(frozen=True)
class Product:
    barcode: str
    name: str
    brand: str
    category: str
    net_weight: str
    serving: str
    nutrition: str
    ingredients: str
    allergens: str
    notes: str

    def compact_card(self) -> str:
        parts = [
            f"{self.name} ({self.brand})",
            f"Barcode {self.barcode}. {self.category}. {self.net_weight}. Serving {self.serving}.",
            f"Nutrition: {self.nutrition}",
            f"Ingredients: {self.ingredients}",
            f"Allergens: {self.allergens}",
        ]
        if self.notes:
            parts.append(f"Notes: {self.notes}")
        text = "\n".join(part for part in parts if part.strip())
        if len(text) > _CARD_LIMIT:
            return text[: _CARD_LIMIT - 1] + "…"
        return text

    def full_text(self) -> str:
        return "\n\n".join(
            block
            for block in (
                self.compact_card(),
                f"Ingredients: {self.ingredients}",
                f"Allergens: {self.allergens}",
                f"Notes: {self.notes}",
            )
            if block.strip()
        )

    def search(self, query: str) -> str:
        needles = [word.lower() for word in query.split() if len(word) > 2]
        sections = [
            ("nutrition", self.nutrition),
            ("ingredients", self.ingredients),
            ("allergens", self.allergens),
            ("notes", self.notes),
        ]
        hits: list[str] = []
        for title, body in sections:
            blob = f"{title} {body}".lower()
            if not needles or any(n in blob for n in needles):
                hits.append(f"{title}: {body}")
        if not hits:
            return "No matching lines on this pack."
        text = "\n".join(hits)
        if len(text) > _CARD_LIMIT:
            return text[: _CARD_LIMIT - 1] + "…"
        return text
