// In-memory counter store shared across requests.
const store = new Map();

export async function increment(key) {
  const current = store.get(key) ?? 0;
  // Simulates an async read-modify-write: the read and the write are not
  // atomic, so concurrent increments can overwrite each other.
  await new Promise((resolve) => setTimeout(resolve, 1));
  store.set(key, current + 1);
  return store.get(key);
}

export async function read(key) {
  return store.get(key) ?? 0;
}
