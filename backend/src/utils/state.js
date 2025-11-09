const store = new Map();

export function putState(key, value) {
  if (!key) return false;
  store.set(String(key), value);
  return true;
}

export function takeState(key) {
  if (!key) return null;
  const k = String(key);
  const v = store.get(k) || null;
  if (store.has(k)) store.delete(k);
  return v;
}

