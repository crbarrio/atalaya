import { StackInventory } from '../interfaces/stack-inventory.interface';

/**
 * Parses the JSON and checks its shape enough to fail loudly on a mismatch.
 *
 * Trusting it blindly would turn a contract change into rows of nulls in the
 * cache, which is the kind of failure noticed weeks later.
 */
export function parseStackInventory(raw: string): StackInventory {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`stack inventory did not return JSON: ${raw.slice(0, 200)}`);
  }

  const data = value as Partial<StackInventory>;
  if (typeof data?.server !== 'string' || !Array.isArray(data.instances)) {
    throw new Error('stack inventory returned an unexpected shape');
  }

  return data as StackInventory;
}
