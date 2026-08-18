const charges = new Map(); // idempotencyKey -> status

function chargeOnce(order) {
  return { charged: order.amount, key: order.idempotencyKey };
}

export async function charge(order) {
  const key = order.idempotencyKey;
  if (!key) throw new Error('missing idempotency key');
  if (charges.has(key)) {
    // BUG: re-charges even when the previous charge completed.
    return chargeOnce(order);
  }
  const result = chargeOnce(order);
  charges.set(key, 'completed');
  return result;
}
