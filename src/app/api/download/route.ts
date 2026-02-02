import { NextResponse } from 'next/server';

import { getProductById } from '@/data/products';
import { getSignedDownloadUrl } from '@/lib/r2';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');
  const productId = searchParams.get('productId');

  if (!orderId || !productId) {
    return NextResponse.json({ error: 'Missing orderId or productId.' }, { status: 400 });
  }

  const product = getProductById(productId);
  if (!product || product.type !== 'digital' || !product.r2Key) {
    return NextResponse.json({ error: 'Product not eligible for download.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: entitlement, error } = await supabase
    .from('entitlements')
    .select('*')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .maybeSingle();

  if (error || !entitlement) {
    return NextResponse.json({ error: 'No entitlement found.' }, { status: 403 });
  }

  if (entitlement.expires_at && new Date(entitlement.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Entitlement expired.' }, { status: 403 });
  }

  const signedUrl = await getSignedDownloadUrl(product.r2Key, 90);
  await supabase
    .from('entitlements')
    .update({ download_count: (entitlement.download_count ?? 0) + 1 })
    .eq('id', entitlement.id);

  return NextResponse.redirect(signedUrl);
}
