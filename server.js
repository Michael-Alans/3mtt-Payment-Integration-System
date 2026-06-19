import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { ordersDb, updateOrderStatus } from './database.js';
import { paystackService } from './paystack.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Globally parse JSON request bodies
app.use(express.json());

// -------------------------------------------------------------------------
// ROUTE 1: Initialize Payment (Amount sent here should be in base currency e.g Naira)
// -------------------------------------------------------------------------
app.post('/api/payment/initialize', async (req, res) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid email and amount are required.' });
    }

    // Convert base amount to Kobo
    const amountInKobo = Math.round(amount * 100);
    
    // Generate a unique transaction reference
    const reference = `TX-${Date.now()}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

    // Establish pending state baseline inside our DB entity
    ordersDb[reference] = {
      reference,
      email,
      amount: amountInKobo,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Make asynchronous handshake invocation to Paystack
    const paystackData = await paystackService.initializeTransaction(email, amountInKobo, reference);

    return res.status(200).json({
      success: true,
      message: 'Payment initialized.',
      authorization_url: paystackData.authorization_url,
      reference,
    });
  } catch (error) {
    console.error('Initialization Controller Error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error initializing payment.' });
  }
});

// -------------------------------------------------------------------------
// ROUTE 2: Explicit Verification Endpoint (Polled by Client / Handled on Redirect)
// -------------------------------------------------------------------------
app.get('/api/payment/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const order = ordersDb[reference];

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order reference not found.' });
    }

    // Run explicit verification with Paystack's ledger
    const transactionData = await paystackService.verifyTransaction(reference);

    if (transactionData.status === 'success') {
      const updatedOrder = updateOrderStatus(reference, 'paid');
      return res.status(200).json({ success: true, message: 'Payment confirmed successfully.', order: updatedOrder });
    } 
    
    if (transactionData.status === 'failed') {
      const updatedOrder = updateOrderStatus(reference, 'failed');
      return res.status(200).json({ success: false, message: 'Payment failed.', order: updatedOrder });
    }

    return res.status(200).json({ success: false, message: 'Payment is still pending.', order });
  } catch (error) {
    console.error('Verification Controller Error:', error.message);
    return res.status(500).json({ success: false, message: 'Error checking transaction status.' });
  }
});

// -------------------------------------------------------------------------
// ROUTE 3: Secure Webhook Endpoint (Idempotent Event Listener)
// -------------------------------------------------------------------------
app.post('/api/payment/webhook', (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET;

    if (!signature || !secret) {
      return res.status(401).json({ message: 'Missing security payload configurations.' });
    }

    // Compute signature hash locally to ensure data integrity
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== signature) {
      console.warn('[Security Warning] Rejected invalid webhook signature attempt.');
      return res.status(401).json({ message: 'Signature verification failed.' });
    }

    const { event, data } = req.body;
    console.log(`[Webhook Event Processed]: ${event}`);

    if (event === 'charge.success') {
      const reference = data.reference;
      
      // Attempt status update. Idempotency layer handles repetitive calls safely
      updateOrderStatus(reference, 'paid');
    }

    // Swiftly return a 200 OK to stop Paystack retry intervals
    return res.sendStatus(200);
  } catch (error) {
    console.error('Webhook Handling Error:', error.message);
    return res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`Server executing safely on port ${PORT}`);
});