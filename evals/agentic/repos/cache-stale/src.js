const cache = new Map();

export function setCached(key, version, value) {
  cache.set(key, { version, value });
  return value;
}

export function getCached(key, version) {
  // BUG: version is ignored — stale entries survive deploys.
  if (cache.has(key)) return cache.get(key).value;
  return null;
}
