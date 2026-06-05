import { NextResponse } from 'next/server';

import { getProductById } from '@/data/products';
import { hashDownloadToken } from '@/lib/downloadTokens';
import { getSignedDownloadUrl } from '@/lib/r2';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token')?.trim();

  if (!token) {
    return NextResponse.json({ error: 'Missing download token.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const tokenHash = hashDownloadToken(token);
  const { data: tokenRow, error: tokenError } = await supabase
    .from('entitlement_download_tokens')
    .select('id, entitlement_id, download_count, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (tokenError) {
    return NextResponse.json({ error: 'No entitlement found.' }, { status: 403 });
  }

  let tokenRecord = tokenRow as {
    id: string;
    entitlement_id: string;
    download_count: number | null;
    expires_at: string | null;
  } | null;
  let entitlementId = tokenRecord?.entitlement_id ?? null;

  if (!entitlementId) {
    const { data: legacyEntitlement, error: legacyError } = await supabase
      .from('entitlements')
      .select('id')
      .eq('download_token_hash', tokenHash)
      .maybeSingle();

    if (legacyError || !legacyEntitlement) {
      return NextResponse.json({ error: 'No entitlement found.' }, { status: 403 });
    }

    entitlementId = (legacyEntitlement as { id: string }).id;
  }

  const { data: entitlement, error } = await supabase
    .from('entitlements')
    .select('id, product_id, download_count, expires_at')
    .eq('id', entitlementId)
    .maybeSingle();

  if (error || !entitlement) {
    return NextResponse.json({ error: 'No entitlement found.' }, { status: 403 });
  }

  const digitalEntitlement = entitlement as {
    id: string;
    product_id: string;
    download_count: number | null;
    expires_at: string | null;
  };
  const product = getProductById(digitalEntitlement.product_id);
  if (!product || product.type !== 'digital' || !product.r2Key) {
    return NextResponse.json({ error: 'Product not eligible for download.' }, { status: 400 });
  }

  if (digitalEntitlement.expires_at && new Date(digitalEntitlement.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Entitlement expired.' }, { status: 403 });
  }

  if (tokenRecord?.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Download token expired.' }, { status: 403 });
  }

  const signedUrl = await getSignedDownloadUrl(product.r2Key, 90);
  if (tokenRecord) {
    await supabase
      .from('entitlement_download_tokens')
      .update({
        download_count: (tokenRecord.download_count ?? 0) + 1,
        last_downloaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tokenRecord.id);
  }

  await supabase
    .from('entitlements')
    .update({
      download_count: (digitalEntitlement.download_count ?? 0) + 1,
      last_downloaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', digitalEntitlement.id);

  return NextResponse.redirect(signedUrl);
}
