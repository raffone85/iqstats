export type AvailabilityStatus =
  | "available"
  | "partial"
  | "unavailable"
  | "stale"
  | "error";

export type AvailabilityReason =
  | "not_mapped"
  | "not_supported"
  | "not_captured"
  | "provider_unavailable"
  | "validation_failed"
  | "insufficient_coverage"
  | "outside_point_in_time_window"
  | "stale_snapshot"
  | "not_exposed_by_source"
  | "not_applicable";

export type SourceKind =
  | "external-data"
  | "iqstats-calibration"
  | "iqstats-derived";

export interface Coverage {
  readonly available: number;
  readonly total: number;
  readonly ratio: number | null;
}

export interface DataAvailability {
  readonly status: AvailabilityStatus;
  readonly reason: AvailabilityReason | null;
  readonly missingFields: readonly string[];
  readonly coverage: Coverage | null;
}

export type FieldValue<T> =
  | {
      readonly status: "available";
      readonly value: T;
      readonly reason: null;
    }
  | {
      readonly status: "stale";
      readonly value: T;
      readonly reason: "stale_snapshot";
    }
  | {
      readonly status: "unavailable";
      readonly value: null;
      readonly reason: AvailabilityReason;
    };

export interface DataProvenance {
  readonly sourceKind: SourceKind;
  readonly capturedAt: string;
  readonly sourceUpdatedAt: string | null;
  readonly asOf: string | null;
}

export interface CalculationMetadata {
  readonly formulaVersion: string;
  readonly sampleSize: number;
  readonly period: {
    readonly from: string | null;
    readonly to: string | null;
  };
}

export interface DataEnvelope<T> {
  readonly data: T | null;
  readonly availability: DataAvailability;
  readonly provenance: DataProvenance;
  readonly calculation: CalculationMetadata | null;
}
