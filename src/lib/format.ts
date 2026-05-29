export const formatCurrency = (amountCents: number, currency = 'USD') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  });

  return formatter.format(amountCents / 100);
};

export const formatProductPrice = (amountCents: number, currency = 'USD') => {
  if (amountCents === 0) {
    return 'Free';
  }

  return formatCurrency(amountCents, currency);
};

export const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
};
