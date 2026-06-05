import type { SupabaseClient } from '@supabase/supabase-js';

import { getProductById } from '@/data/products';
import {
  createDownloadToken,
  hashDownloadToken,
  type DownloadTokenPurpose,
} from '@/lib/downloadTokens';

export interface DigitalDownloadLink {
  productId: string;
  productName: string;
  downloadUrl: string;
}

interface CreateEntitlementDownloadTokenParams {
  supabase: SupabaseClient;
  entitlementId: string;
  purpose: DownloadTokenPurpose;
}

interface CreateOrderDownloadLinksParams {
  supabase: SupabaseClient;
  orderId: string;
  appOrigin: string;
}

export const toDownloadUrl = (appOrigin: string, token: string) => {
  const url = new URL('/api/download', appOrigin);
  url.searchParams.set('token', token);
  return url.toString();
};

export const createEntitlementDownloadToken = async ({
  supabase,
  entitlementId,
  purpose,
}: CreateEntitlementDownloadTokenParams) => {
  const token = createDownloadToken();
  const { error } = await supabase.from('entitlement_download_tokens').insert({
    entitlement_id: entitlementId,
    token_hash: hashDownloadToken(token),
    purpose,
  });

  if (error) {
    throw error;
  }

  return token;
};

export const createOrderDownloadLinks = async ({
  supabase,
  orderId,
  appOrigin,
}: CreateOrderDownloadLinksParams): Promise<DigitalDownloadLink[]> => {
  const { data: entitlements, error } = await supabase
    .from('entitlements')
    .select('id, product_id')
    .eq('order_id', orderId);

  if (error) {
    throw error;
  }

  const links: DigitalDownloadLink[] = [];
  for (const entitlement of (entitlements ?? []) as Array<{ id: string; product_id: string }>) {
    const product = getProductById(entitlement.product_id);
    if (!product || product.type !== 'digital' || !product.r2Key) {
      continue;
    }

    const token = await createEntitlementDownloadToken({
      supabase,
      entitlementId: entitlement.id,
      purpose: 'checkout_return',
    });

    links.push({
      productId: product.id,
      productName: product.name,
      downloadUrl: toDownloadUrl(appOrigin, token),
    });
  }

  return links;
};
