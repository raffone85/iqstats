import type {
  AvailabilityReason,
  AvailabilityStatus,
  Coverage,
  DataAvailability,
  DataProvenance,
  FieldValue,
} from "../contracts/common.ts";

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function stringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return nonEmptyString(value);
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function finiteInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

export function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function isoDateTime(value: unknown): string | null {
  const text = nonEmptyString(value);
  if (!text) return null;
  return Number.isNaN(Date.parse(text)) ? null : text;
}

export function available<T>(value: T): FieldValue<T> {
  return { status: "available", value, reason: null };
}

export function unavailable<T>(reason: AvailabilityReason): FieldValue<T> {
  return { status: "unavailable", value: null, reason };
}

export function makeCoverage(availableCount: number, total: number): Coverage {
  return {
    available: availableCount,
    total,
    ratio: total > 0 ? availableCount / total : null,
  };
}

export function makeAvailability(
  status: AvailabilityStatus,
  reason: AvailabilityReason | null,
  missingFields: readonly string[] = [],
  coverage: Coverage | null = null,
): DataAvailability {
  return { status, reason, missingFields, coverage };
}

export function makeProvenance(
  capturedAt: string,
  sourceUpdatedAt: string | null = null,
  asOf: string | null = null,
): DataProvenance {
  const normalizedCapturedAt = isoDateTime(capturedAt);
  if (!normalizedCapturedAt) throw new Error("capturedAt must be a valid ISO date-time.");
  return {
    sourceKind: "external-data",
    capturedAt: normalizedCapturedAt,
    sourceUpdatedAt,
    asOf,
  };
}

export function arrayFrom(value: unknown, field: string): readonly unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  const nested = value[field];
  return Array.isArray(nested) ? nested : null;
}
