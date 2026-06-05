export interface DigitalFulfillmentEmailItem {
  productName: string;
  downloadUrl: string;
}

interface BuildDigitalFulfillmentEmailParams {
  orderId: string;
  items: ReadonlyArray<DigitalFulfillmentEmailItem>;
  replyToEmail?: string | null;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatOrderReference = (orderId: string) => orderId.slice(0, 8).toUpperCase();

export const buildDigitalFulfillmentEmail = ({
  orderId,
  items,
  replyToEmail,
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
        <li style="margin: 0 0 18px;">
          <strong>${escapeHtml(item.productName)}</strong><br />
          <a href="${escapeHtml(item.downloadUrl)}" style="color: #111827;">Download zip</a>
        </li>
      `,
    )
    .join('');
  const itemListText = items
    .map((item) => `${item.productName}\n${item.downloadUrl}`)
    .join('\n\n');
  const replyLine = replyToEmail
    ? `Questions? Reply to this email or reach us at ${replyToEmail}.`
    : 'Questions? Reply to this email and we will help.';

  return {
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <p>Thanks for supporting thx4cmn.</p>
        <p>Your digital download${items.length === 1 ? '' : 's'} for order ${escapeHtml(
          orderReference,
        )} ${items.length === 1 ? 'is' : 'are'} ready:</p>
        <ul style="padding-left: 20px;">${itemListHtml}</ul>
        <p style="color: #4b5563;">${escapeHtml(replyLine)}</p>
      </div>
    `,
    text: `Thanks for supporting thx4cmn.\n\nYour digital download${
      items.length === 1 ? '' : 's'
    } for order ${orderReference} ${items.length === 1 ? 'is' : 'are'} ready:\n\n${itemListText}\n\n${replyLine}`,
  };
};
