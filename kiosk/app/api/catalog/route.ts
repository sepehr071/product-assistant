import { NextResponse } from 'next/server';
import { listProducts } from '@/lib/catalog';

export const revalidate = 0;

export async function GET() {
  const products = await listProducts();
  return NextResponse.json({ products });
}
