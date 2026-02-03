import Stripe from 'stripe';

export const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.');
  }

  return new Stripe(secretKey, {
    apiVersion: '2024-04-10',
    typescript: true,
  });
};
