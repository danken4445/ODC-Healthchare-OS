/** Disease categories used by the privacy-safe surveillance rollup. */
export type DiseaseCategory =
  | "Acute Respiratory"
  | "Vector-borne"
  | "Diarrheal"
  | "Cardiovascular"
  | "Syndromic";

/** Age cohorts stored by the Loop 1 database contract. */
export type AgeBracket =
  | "infant_under_1"
  | "child_1_to_4"
  | "school_5_to_14"
  | "reproductive_15_to_49"
  | "middle_50_to_64"
  | "senior_65_plus"
  | "unknown";

/** DOH notifiability class assigned to a normalized clinical match. */
export type DohNotifiableClass = "category_i" | "category_ii" | "not_notifiable";

/** A privacy-safe, normalized diagnosis candidate produced by the classifier. */
export interface ClinicalDiagnosisMatch {
  readonly diseaseName: string;
  readonly icd10Code: string | null;
  readonly diseaseCategory: DiseaseCategory;
  readonly dohNotifiableClass: DohNotifiableClass;
  readonly isSensitive: boolean;
  readonly sensitiveCategory: string | null;
  readonly provisional: boolean;
  readonly source: "synonym" | "syndromic" | "fuzzy" | "sensitive";
}

/** One weekly anonymized disease trend point. */
export interface EpiTrendDataPoint {
  readonly epiYear: number;
  readonly epiWeek: number;
  readonly icd10Code: string;
  readonly diseaseName: string;
  readonly dohCategory: DiseaseCategory;
  readonly ageBracket: AgeBracket;
  readonly gender: "male" | "female" | "other" | "unknown";
  readonly caseCount: number | null;
  readonly isSuppressed: boolean;
}

/** A GeoJSON-compatible polygon feature containing only aggregated metrics. */
export interface SpatialChoroplethFeature {
  readonly type: "Feature";
  readonly geometry: {
    readonly type: "Polygon" | "MultiPolygon";
    readonly coordinates: readonly unknown[];
  };
  readonly properties: {
    readonly municipality: string | null;
    readonly barangay: string | null;
    readonly caseCount: number | null;
    readonly incidenceRatePer10000: number | null;
    readonly isSuppressed: boolean;
  };
}
