export interface DigitalFulfillmentEmailItem {
  productName: string;
  downloadUrl: string;
}

export interface DigitalFulfillmentReceiptItem {
  productName: string;
  quantity: number;
  unitAmountCents: number;
}

interface BuildDigitalFulfillmentEmailParams {
  orderId: string;
  items: ReadonlyArray<DigitalFulfillmentEmailItem>;
  customerEmail?: string | null;
  paymentStatus?: string | null;
  amountTotalCents?: number | null;
  currency?: string | null;
  receiptItems?: ReadonlyArray<DigitalFulfillmentReceiptItem>;
  replyToEmail?: string | null;
  logoSrc?: string | null;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatOrderReference = (orderId: string) => orderId.slice(0, 8).toUpperCase();

const formatCurrency = (amountCents: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountCents / 100);

const formatPaymentStatus = (status?: string | null) => {
  if (status === 'no_payment_required') return 'No payment required';
  if (status === 'paid') return 'Paid';
  if (status === 'unpaid') return 'Unpaid';
  return status ? status.replaceAll('_', ' ') : 'Recorded';
};

export const buildDigitalFulfillmentEmail = ({
  orderId,
  items,
  customerEmail,
  paymentStatus,
  amountTotalCents,
  currency,
  receiptItems = [],
  replyToEmail,
  logoSrc,
}: BuildDigitalFulfillmentEmailParams) => {
  const firstItem = items[0];
  const subject =
    items.length === 1 && firstItem
      ? `Your ${firstItem.productName} download`
      : 'Your thx4cmn downloads';
  const orderReference = formatOrderReference(orderId);
  const itemListHtml = items
    .map(
      (item) => `
        <li style="margin: 0 0 18px; padding: 14px; border: 1px solid #e5e7eb; border-radius: 8px; list-style-position: inside;">
          <strong>${escapeHtml(item.productName)}</strong><br />
          <a href="${escapeHtml(item.downloadUrl)}" style="color: #111827;">Download zip</a>
        </li>
      `,
    )
    .join('');
  const itemListText = items
    .map((item) => [item.productName, `Download: ${item.downloadUrl}`].join('\n'))
    .join('\n\n');
  const resolvedCurrency = currency?.toUpperCase() || 'USD';
  const receiptTotal =
    typeof amountTotalCents === 'number'
      ? formatCurrency(amountTotalCents, resolvedCurrency)
      : 'Recorded';
  const receiptStatus = formatPaymentStatus(paymentStatus);
  const receiptItemsHtml = receiptItems
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb;">${escapeHtml(
            item.productName,
          )}</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: center;">${escapeHtml(
            String(item.quantity),
          )}</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right;">${escapeHtml(
            formatCurrency(item.unitAmountCents * item.quantity, resolvedCurrency),
          )}</td>
        </tr>
      `,
    )
    .join('');
  const receiptItemsText = receiptItems
    .map(
      (item) =>
        `${item.productName} x${item.quantity} - ${formatCurrency(
          item.unitAmountCents * item.quantity,
          resolvedCurrency,
        )}`,
    )
    .join('\n');
  const replyLine = replyToEmail
    ? `Questions? Reply to this email or reach us at ${replyToEmail}.`
    : 'Questions? Reply to this email and we will help.';
  const logoHtml = logoSrc
    ? `<p style="margin: 24px 0 10px;"><img src="${escapeHtml(
        logoSrc,
      )}" width="140" alt="thx4cmn" style="display: block; width: 140px; max-width: 100%; height: auto;" /></p>`
    : '';

  return {
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <p>Thanks for supporting thx4cmn.</p>
        <div style="margin: 18px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <p style="margin: 0 0 10px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #4b5563;">Receipt</p>
          <p style="margin: 0;">Order: <strong>${escapeHtml(orderReference)}</strong></p>
          <p style="margin: 0;">Status: <strong>${escapeHtml(receiptStatus)}</strong></p>
          <p style="margin: 0;">Total: <strong>${escapeHtml(receiptTotal)}</strong></p>
          ${
            customerEmail
              ? `<p style="margin: 0;">Email: <strong>${escapeHtml(customerEmail)}</strong></p>`
              : ''
          }
          ${
            receiptItems.length > 0
              ? `<table style="width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 14px;">
                  <thead>
                    <tr>
                      <th style="padding: 0 0 8px; text-align: left; color: #4b5563;">Item</th>
                      <th style="padding: 0 0 8px; text-align: center; color: #4b5563;">Qty</th>
                      <th style="padding: 0 0 8px; text-align: right; color: #4b5563;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>${receiptItemsHtml}</tbody>
                </table>`
              : ''
          }
        </div>
        <p>Your digital download${items.length === 1 ? '' : 's'} for order ${escapeHtml(
          orderReference,
        )} ${items.length === 1 ? 'is' : 'are'} ready:</p>
        <ul style="padding-left: 20px;">${itemListHtml}</ul>
        ${logoHtml}
        <p style="color: #4b5563;">${escapeHtml(replyLine)}</p>
      </div>
    `,
    text: `Thanks for supporting thx4cmn.\n\nReceipt\nOrder: ${orderReference}\nStatus: ${receiptStatus}\nTotal: ${receiptTotal}${
      customerEmail ? `\nEmail: ${customerEmail}` : ''
    }${receiptItemsText ? `\n\nItems\n${receiptItemsText}` : ''}\n\nYour digital download${
      items.length === 1 ? '' : 's'
    } for order ${orderReference} ${items.length === 1 ? 'is' : 'are'} ready:\n\n${itemListText}\n\n${replyLine}`,
  };
};
