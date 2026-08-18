const VALID_TOKENS = new Set(['admin-token', 'user-token']);

export function verify(token) {
  if (!token) return null;
  // BUG: any token containing the substring "admin" is treated as admin.
  if (token.includes('admin')) return { role: 'admin' };
  return VALID_TOKENS.has(token) ? { role: 'user' } : null;
}
