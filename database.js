// Mock Database Table
export const ordersDb = {};

/**
 * State Machine transitions: pending -> paid OR pending -> failed
 * Enforces strict Idempotency
 */
export const updateOrderStatus = (reference, status) => {
  const order = ordersDb[reference];
  if (!order) {
    console.error(`[DB Error] Order with reference ${reference} not found.`);
    return null;
  }

  // IDEMPOTENCY GUARD: If the order is already finalized, skip state changes
  if (order.status === 'paid' || order.status === 'failed') {
    console.log(`[DB Warning] Order ${reference} already finalized as '${order.status}'. Skipping state transition.`);
    return order;
  }

  // Execute state transition safely
  order.status = status;
  order.updatedAt = new Date().toISOString();
  
  console.log(`[DB Success] Order ${reference} status updated to '${status}'.`);
  return order;
};