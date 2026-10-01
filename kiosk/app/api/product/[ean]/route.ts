import { NextResponse } from 'next/server';
import { getProduct, isBarcode } from '@/lib/catalog';

export const revalidate = 0;

export async function GET(_req: Request, ctx: { params: Promise<{ ean: string }> }) {
  const { ean } = await ctx.params;
  if (!isBarcode(ean)) {
    return NextResponse.json({ error: 'bad barcode' }, { status: 400 });
  }
  const product = await getProduct(ean);
  if (!product) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(product);
}
