import {
  buildDigitalFulfillmentEmail,
  type DigitalFulfillmentEmailItem,
  type DigitalFulfillmentReceiptItem,
} from './fulfillmentEmail';
import { EMAIL_LOGO_CID, readEmailLogoAttachment } from './emailLogoAttachment';

const RESEND_EMAIL_API_URL = 'https://api.resend.com/emails';

interface SendDigitalFulfillmentEmailParams {
  recipientEmail: string;
  orderId: string;
  items: ReadonlyArray<DigitalFulfillmentEmailItem>;
  customerEmail?: string | null;
  paymentStatus?: string | null;
  amountTotalCents?: number | null;
  currency?: string | null;
  receiptItems?: ReadonlyArray<DigitalFulfillmentReceiptItem>;
  idempotencyKey: string;
}

type FetchLike = typeof fetch;

const readRequiredEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`);
  }
  return value;
};

const parseResendError = (payload: unknown) => {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof (payload as { message?: unknown }).message === 'string'
  ) {
    return (payload as { message: string }).message;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error?: { message?: unknown } }).error?.message === 'string'
  ) {
    return (payload as { error: { message: string } }).error.message;
  }

  return 'Unknown Resend error.';
};

export const sendDigitalFulfillmentEmail = async (
  {
    recipientEmail,
    orderId,
    items,
    customerEmail,
    paymentStatus,
    amountTotalCents,
    currency,
    receiptItems,
    idempotencyKey,
  }: SendDigitalFulfillmentEmailParams,
  fetchImpl: FetchLike = fetch,
) => {
  if (items.length === 0) {
    throw new Error('Cannot send a fulfillment email without download items.');
  }

  const apiKey = readRequiredEnv('RESEND_API_KEY');
  const from = readRequiredEnv('RESEND_FROM_EMAIL');
  const replyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim();
  const logoAttachment = readEmailLogoAttachment();
  const email = buildDigitalFulfillmentEmail({
    orderId,
    items,
    customerEmail,
    paymentStatus,
    amountTotalCents,
    currency,
    receiptItems,
    replyToEmail: replyTo || null,
    logoSrc: `cid:${EMAIL_LOGO_CID}`,
  });
  const body: Record<string, unknown> = {
    from,
    to: [recipientEmail],
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [logoAttachment],
  };

  if (replyTo) {
    body.reply_to = replyTo;
  }

  const response = await fetchImpl(RESEND_EMAIL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Resend email failed: ${parseResendError(payload)}`);
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('id' in payload) ||
    typeof (payload as { id?: unknown }).id !== 'string'
  ) {
    throw new Error('Resend email response did not include a message id.');
  }

  return { id: (payload as { id: string }).id };
};
