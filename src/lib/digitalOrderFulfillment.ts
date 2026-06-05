import type { SupabaseClient } from '@supabase/supabase-js';

import { toDownloadUrl } from './downloadLinks';
import { sendDigitalFulfillmentEmail } from './resend';

export interface PendingDigitalDelivery {
  fulfillmentId: string;
  productId: string;
  productName: string;
  downloadToken: string;
}

interface FulfillDigitalOrderParams {
  supabase: SupabaseClient;
  orderId: string;
  recipientEmail: string | null;
  deliveries: ReadonlyArray<PendingDigitalDelivery>;
  appOrigin: string;
}

const toLastError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const fulfillDigitalOrder = async ({
  supabase,
  orderId,
  recipientEmail,
  deliveries,
  appOrigin,
}: FulfillDigitalOrderParams) => {
  if (!recipientEmail || deliveries.length === 0) {
    return null;
  }

  const fulfillmentIds = deliveries.map((delivery) => delivery.fulfillmentId);
  const emailItems = deliveries.map((delivery) => ({
    productName: delivery.productName,
    downloadUrl: toDownloadUrl(appOrigin, delivery.downloadToken),
  }));
  const idempotencyKey = `digital-fulfillment-${orderId}-${fulfillmentIds.join('-')}`;

  try {
    const result = await sendDigitalFulfillmentEmail({
      recipientEmail,
      orderId,
      items: emailItems,
      idempotencyKey,
    });

    const { error } = await supabase
      .from('digital_fulfillments')
      .update({
        provider: 'resend',
        provider_message_id: result.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', fulfillmentIds);

    if (error) {
      console.error('Unable to mark digital fulfillment email as sent.', error);
    }

    return result;
  } catch (error) {
    await supabase
      .from('digital_fulfillments')
      .update({
        provider: 'resend',
        status: 'failed',
        last_error: toLastError(error),
        updated_at: new Date().toISOString(),
      })
      .in('id', fulfillmentIds);

    throw error;
  }
};
