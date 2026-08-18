export function createTransfer(from, to, amount) {
  // BUG: no validation — negative amounts and empty accounts accepted.
  return { from, to, amount, status: 'pending' };
}
