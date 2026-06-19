import dotenv from 'dotenv';

dotenv.config();

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const getHeaders = () => ({
  Authorization: `Bearer ${SECRET_KEY}`,
  'Content-Type': 'application/json',
});

export const paystackService = {
  /**
   * Initializes a transaction and returns authorization URL
   */
  initializeTransaction: async (email, amountInKobo, reference) => {
    // Dynamic fallback URL configured straight from your environment variables
    const callbackUrl = `${process.env.APP_BASE_URL || 'http://localhost:5000'}/api/payment/callback`;

    const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        email,
        amount: amountInKobo,
        reference,
        callback_url: callbackUrl,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to initialize transaction via Paystack.');
    }

    return result.data;
  },

  /**
   * Verifies a transaction status directly from Paystack servers
   */
  verifyTransaction: async (reference) => {
    const encodedRef = encodeURIComponent(reference);
    const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodedRef}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to verify transaction via Paystack.');
    }

    return result.data;
  }
};