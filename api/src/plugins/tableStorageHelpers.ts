/**
 * Helpers for Azure Table Storage entity serialization.
 *
 * Serialization rules:
 *  - Arrays / nested objects / Records → JSON string stored in `{name}_json`
 *  - `null` string fields → empty string `""` in storage, converted back on read
 *  - Primitives (string, number, boolean) → stored directly
 */

import type { TableEntity } from '@azure/data-tables';

// ── Inverted timestamp for newest-first audit ordering ──────────────────

const MAX_TS = 9_999_999_999_999;

export function invertedTimestamp(ms: number = Date.now()): string {
  return String(MAX_TS - ms).padStart(13, '0');
}

export function invertedTimestampToMs(inverted: string): number {
  return MAX_TS - Number(inverted);
}

// ── Generic entity ↔ domain-object mapping ──────────────────────────────

/**
 * Convert a plain domain object into a flat Table Storage entity.
 *
 * - `partitionKey` and `rowKey` are set by the caller.
 * - For each property of `obj`:
 *   - `null` / `undefined` → stored as empty string `""` with original key
 *   - `string | number | boolean` → stored directly
 *   - `object | array` → JSON-stringified and stored under `{key}_json`
 */
export function toEntity<T extends Record<string, unknown>>(
  partitionKey: string,
  rowKey: string,
  obj: T,
): TableEntity {
  const entity: Record<string, unknown> = { partitionKey, rowKey };
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      entity[key] = '';
    } else if (typeof value === 'object') {
      entity[`${key}_json`] = JSON.stringify(value);
    } else {
      entity[key] = value;
    }
  }
  return entity as TableEntity;
}

/**
 * Convert a Table Storage entity back into a plain object.
 *
 * `nullableFields` lists fields that should be converted from `""` → `null`.
 * `jsonFields` lists fields whose `_json` suffix holds a JSON string.
 */
export function fromEntity<T>(
  entity: Record<string, unknown>,
  nullableFields: readonly string[],
  jsonFields: readonly string[],
): T {
  const obj: Record<string, unknown> = {};

  // Copy all non-metadata keys
  for (const [key, value] of Object.entries(entity)) {
    if (key === 'partitionKey' || key === 'rowKey' || key === 'etag' || key === 'timestamp') {
      continue;
    }
    // Skip _json keys — we'll reconstruct them below
    if (key.endsWith('_json')) continue;
    obj[key] = value;
  }

  // Restore JSON fields
  for (const field of jsonFields) {
    const raw = entity[`${field}_json`];
    if (typeof raw === 'string' && raw.length > 0) {
      obj[field] = JSON.parse(raw);
    } else {
      // If empty string or missing, set to null (caller decides default)
      obj[field] = null;
    }
  }

  // Restore nullable fields
  for (const field of nullableFields) {
    if (obj[field] === '') {
      obj[field] = null;
    }
  }

  return obj as T;
}
