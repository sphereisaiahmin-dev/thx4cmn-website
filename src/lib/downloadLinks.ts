import type { SupabaseClient } from '@supabase/supabase-js';

import { getProductById } from '@/data/products';
import {
  CHECKOUT_RETURN_DOWNLOAD_MAX_DOWNLOADS,
  CHECKOUT_RETURN_DOWNLOAD_TOKEN_TTL_MS,
  createDownloadToken,
  deriveCheckoutReturnDownloadToken,
  downloadTokenExpiresAt,
  EMAIL_DOWNLOAD_MAX_DOWNLOADS,
  EMAIL_DOWNLOAD_TOKEN_TTL_MS,
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
  token?: string;
  expiresAt?: string;
  maxDownloads?: number;
  upsert?: boolean;
}

interface CreateOrderDownloadLinksParams {
  supabase: SupabaseClient;
  orderId: string;
  appOrigin: string;
  returnToken: string;
  expiresAt?: string;
  maxDownloads?: number;
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
  token: providedToken,
  expiresAt,
  maxDownloads,
  upsert = false,
}: CreateEntitlementDownloadTokenParams) => {
  const token = providedToken ?? createDownloadToken();
  const row = {
    entitlement_id: entitlementId,
    token_hash: hashDownloadToken(token),
    purpose,
    expires_at:
      expiresAt ??
      downloadTokenExpiresAt(
        purpose === 'email' ? EMAIL_DOWNLOAD_TOKEN_TTL_MS : CHECKOUT_RETURN_DOWNLOAD_TOKEN_TTL_MS,
      ),
    max_downloads:
      maxDownloads ??
      (purpose === 'email' ? EMAIL_DOWNLOAD_MAX_DOWNLOADS : CHECKOUT_RETURN_DOWNLOAD_MAX_DOWNLOADS),
  };

  const query = upsert
    ? supabase
        .from('entitlement_download_tokens')
        .upsert(row, { onConflict: 'token_hash' })
    : supabase.from('entitlement_download_tokens').insert(row);

  const { error } = await query;

  if (error) {
    throw error;
  }

  return token;
};

export const createOrderDownloadLinks = async ({
  supabase,
  orderId,
  appOrigin,
  returnToken,
  expiresAt,
  maxDownloads = CHECKOUT_RETURN_DOWNLOAD_MAX_DOWNLOADS,
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
      token: deriveCheckoutReturnDownloadToken(returnToken, entitlement.id),
      expiresAt:
        expiresAt ?? downloadTokenExpiresAt(CHECKOUT_RETURN_DOWNLOAD_TOKEN_TTL_MS),
      maxDownloads,
      upsert: true,
    });

    links.push({
      productId: product.id,
      productName: product.name,
      downloadUrl: toDownloadUrl(appOrigin, token),
    });
  }

  return links;
};
