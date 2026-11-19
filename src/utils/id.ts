/**
 * Creates a unique ID with a readable prefix, e.g. `createId('m')` returns `"m-3f2c…"`.
 *
 * `crypto.randomUUID()` is built into every modern browser and Node.js, so no library is needed.
 */
export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
