import fs from 'node:fs/promises';
import path from 'node:path';

const BARCODE = /^[0-9]{8,14}$/;

export type ProductSummary = {
  barcode: string;
  name: string;
  brand: string;
  category: string;
};

export type ProductCard = ProductSummary & {
  nutrition: string;
  ingredients: string;
  allergens: string;
  notes: string;
};

export function catalogRoot(): string {
  if (process.env.CATALOG_DIR) {
    return path.resolve(process.env.CATALOG_DIR);
  }
  return path.resolve(process.cwd(), '..', 'data', 'products');
}

export function isBarcode(value: string): boolean {
  return BARCODE.test(value);
}

function safeDir(root: string, barcode: string): string | null {
  if (!isBarcode(barcode)) {
    return null;
  }
  const resolved = path.resolve(root, barcode);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return resolved;
}

async function readText(file: string): Promise<string> {
  try {
    return (await fs.readFile(file, 'utf8')).trim();
  } catch {
    return '';
  }
}

function parseMeta(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (match) {
      out[match[1].toLowerCase()] = match[2].trim();
    }
  }
  return out;
}

export async function listProducts(): Promise<ProductSummary[]> {
  const root = catalogRoot();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const items: ProductSummary[] = [];
  for (const name of entries.sort()) {
    const card = await getProduct(name);
    if (card) {
      items.push({
        barcode: card.barcode,
        name: card.name,
        brand: card.brand,
        category: card.category,
      });
    }
  }
  return items;
}

export async function getProduct(barcode: string): Promise<ProductCard | null> {
  const dir = safeDir(catalogRoot(), barcode);
  if (!dir) {
    return null;
  }
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }
  const meta = parseMeta(await readText(path.join(dir, 'meta.txt')));
  return {
    barcode,
    name: meta.name || barcode,
    brand: meta.brand || '',
    category: meta.category || '',
    nutrition: await readText(path.join(dir, 'nutrition.txt')),
    ingredients: await readText(path.join(dir, 'ingredients.txt')),
    allergens: await readText(path.join(dir, 'allergens.txt')),
    notes: await readText(path.join(dir, 'notes.txt')),
  };
}
