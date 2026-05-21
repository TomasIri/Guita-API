/** Generate a collision-resistant unique identifier using the Web Crypto API. */
export function generateId() {
  return crypto.randomUUID();
}
