import type {
  ClinicalDiagnosisMatch,
  DiseaseCategory,
  DohNotifiableClass,
} from "@odyssey/types";
import { detectSensitiveCategory } from "./pmr-builder.ts";

/** Negation and provisional language detected in clinical free text. */
export interface ClinicalTextModifiers {
  readonly negatedTerms: readonly string[];
  readonly qualifierTerms: readonly string[];
}

/** The typed boundary for a future pg_trgm/ICD reference lookup. */
export interface IcdFuzzyMatcher {
  match(text: string): Promise<ReadonlyArray<{ icd10Code: string; diseaseName: string; score: number }>>;
}

type Synonym = Readonly<{
  pattern: RegExp;
  diseaseName: string;
  icd10Code: string;
  diseaseCategory: DiseaseCategory;
  dohNotifiableClass: DohNotifiableClass;
}>;

const synonym = (
  terms: string,
  diseaseName: string,
  icd10Code: string,
  diseaseCategory: DiseaseCategory,
  dohNotifiableClass: DohNotifiableClass = "not_notifiable",
): Synonym => ({
  pattern: new RegExp(`\\b(?:${terms})(?:[-]?[A-Z])?\\b`, "i"),
  diseaseName,
  icd10Code,
  diseaseCategory,
  dohNotifiableClass,
});

const SYNONYMS: readonly Synonym[] = [
  synonym("AURI|URTI", "Acute upper respiratory infection", "J06.9", "Acute Respiratory"),
  synonym("AGE|LBM", "Infectious gastroenteritis", "A09", "Diarrheal", "category_ii"),
  synonym("CAP|PCAP|PNEUMONIA", "Pneumonia", "J18.9", "Acute Respiratory"),
  synonym("HPN|HTN", "Essential hypertension", "I10", "Cardiovascular"),
  synonym("T2DM|DM2|NIDDM", "Type 2 diabetes mellitus", "E11.9", "Cardiovascular"),
  synonym("PTB|PULMONARY TB", "Pulmonary tuberculosis", "A15.0", "Acute Respiratory", "category_ii"),
  synonym("DENGUE|DF", "Dengue fever", "A90", "Vector-borne", "category_ii"),
  synonym("UTI", "Urinary tract infection", "N39.0", "Syndromic"),
  synonym("GERD|GORD", "Gastro-esophageal reflux disease", "K21.9", "Syndromic"),
  synonym("TB", "Tuberculosis", "A15.9", "Acute Respiratory", "category_ii"),
  synonym("ILI", "Influenza-like illness", "J11.1", "Syndromic"),
  synonym("AFI", "Acute febrile illness", "R50.9", "Syndromic"),
  synonym("ACS", "Acute coronary syndrome", "I24.9", "Cardiovascular"),
  synonym("MI|AMI", "Acute myocardial infarction", "I21.9", "Cardiovascular"),
  synonym("CHF|CCF", "Congestive heart failure", "I50.9", "Cardiovascular"),
  synonym("CVA|STROKE", "Stroke", "I64", "Cardiovascular"),
  synonym("CAD|IHD", "Ischaemic heart disease", "I25.9", "Cardiovascular"),
  synonym("HYPERLIPIDEMIA|HLD", "Hyperlipidemia", "E78.5", "Cardiovascular"),
  synonym("ASTHMA", "Asthma", "J45.9", "Acute Respiratory"),
  synonym("COPD", "Chronic obstructive pulmonary disease", "J44.9", "Acute Respiratory"),
  synonym("BRONCHITIS", "Bronchitis", "J40", "Acute Respiratory"),
  synonym("PHARYNGITIS", "Acute pharyngitis", "J02.9", "Acute Respiratory"),
  synonym("TONSILLITIS", "Tonsillitis", "J03.9", "Acute Respiratory"),
  synonym("SINUSITIS", "Sinusitis", "J32.9", "Acute Respiratory"),
  synonym("COVID(?:-19)?|SARS[- ]?COV[- ]?2", "COVID-19", "U07.1", "Acute Respiratory", "category_ii"),
  synonym("INFLUENZA|FLU", "Influenza", "J11.1", "Acute Respiratory", "category_ii"),
  synonym("MEASLES|RUBEOLA", "Measles", "B05.9", "Syndromic", "category_i"),
  synonym("CHICKENPOX|VARICELLA", "Varicella", "B01.9", "Syndromic", "category_ii"),
  synonym("MUMPS", "Mumps", "B26.9", "Syndromic", "category_ii"),
  synonym("PERTUSSIS|WHOOPING COUGH", "Pertussis", "A37.9", "Acute Respiratory", "category_ii"),
  synonym("CHOLERA", "Cholera", "A00.9", "Diarrheal", "category_i"),
  synonym("TYPHOID|ENTERIC FEVER", "Typhoid fever", "A01.0", "Diarrheal", "category_ii"),
  synonym("HEPATITIS A|HEPA", "Hepatitis A", "B15.9", "Syndromic", "category_ii"),
  synonym("LEPTOSPIROSIS|LEPTO", "Leptospirosis", "A27.9", "Vector-borne", "category_ii"),
  synonym("MALARIA", "Malaria", "B54", "Vector-borne", "category_ii"),
  synonym("RABIES", "Rabies", "A82.9", "Syndromic", "category_i"),
  synonym("MPOX|MONKEYPOX", "Mpox", "B04", "Syndromic", "category_i"),
  synonym("GASTRITIS", "Gastritis", "K29.7", "Syndromic"),
  synonym("PUD|PEPTIC ULCER", "Peptic ulcer disease", "K27.9", "Syndromic"),
  synonym("IBS", "Irritable bowel syndrome", "K58.9", "Diarrheal"),
  synonym("CONSTIPATION", "Constipation", "K59.0", "Syndromic"),
  synonym("CKD|CHRONIC KIDNEY", "Chronic kidney disease", "N18.9", "Syndromic"),
  synonym("AKI", "Acute kidney failure", "N17.9", "Syndromic"),
  synonym("ANEMIA", "Anemia", "D64.9", "Syndromic"),
  synonym("DENGUE HEMORRHAGIC|DHF", "Dengue hemorrhagic fever", "A91", "Vector-borne", "category_ii"),
  synonym("HAND FOOT MOUTH|HFMD", "Hand, foot and mouth disease", "B08.4", "Syndromic", "category_ii"),
  synonym("CONJUNCTIVITIS|PINK EYE", "Conjunctivitis", "H10.9", "Syndromic"),
  synonym("DERMATITIS|ECZEMA", "Dermatitis", "L30.9", "Syndromic"),
  synonym("GOUT", "Gout", "M10.9", "Syndromic"),
  synonym("ARTHRITIS", "Arthritis", "M19.9", "Syndromic"),
  synonym("MIGRAINE", "Migraine", "G43.9", "Syndromic"),
  synonym("URTICARIA|HIVES", "Urticaria", "L50.9", "Syndromic"),
];

const NEGATION = /\b(?:no|denies|negative for|ruled out)\b\s+([^,.;]*(?:\b(?:dengue|tb|pneumonia|cough|fever|uti|hiv|aids)\b)[^,.;]*)/gi;
const QUALIFIER = /\b(?:T\/C|R\/O|probable|possible|suspected|vs\.?|versus)\b/gi;

/** Extracts the first SOAP Assessment or Impression section, including continuation lines. */
export function extractClinicalImpression(soapText: string | null | undefined): string | null {
  if (!soapText?.trim()) return null;
  const match = soapText.match(/(?:^|\n|\r)\s*(?:A|Assessment|Impression|Dx)\s*:\s*([\s\S]*?)(?=\n\s*(?:S|O|P|Subjective|Objective|Plan|Assessment|Impression|Dx)\s*:|$)/i);
  const impression = match?.[1]?.trim().replace(/\s+/g, " ");
  return impression || null;
}

/** Detects local negations and provisional diagnostic qualifiers without crossing clause boundaries. */
export function detectNegationAndQualifiers(text: string | null | undefined): ClinicalTextModifiers {
  if (!text?.trim()) return { negatedTerms: [], qualifierTerms: [] };
  const negatedTerms = [...text.matchAll(NEGATION)].map((match) => match[1].trim());
  const qualifierTerms = [...text.matchAll(QUALIFIER)].map((match) => match[0]);
  return { negatedTerms, qualifierTerms };
}

/** Finds the first deterministic Philippine clinical shorthand or disease synonym. */
export function matchPhilippineSynonym(text: string | null | undefined): ClinicalDiagnosisMatch | null {
  if (!text?.trim()) return null;
  const match = SYNONYMS.find((entry) => entry.pattern.test(text));
  if (!match) return null;
  return {
    diseaseName: match.diseaseName,
    icd10Code: match.icd10Code,
    diseaseCategory: match.diseaseCategory,
    dohNotifiableClass: match.dohNotifiableClass,
    isSensitive: false,
    sensitiveCategory: null,
    provisional: false,
    source: "synonym",
  };
}

function isNegated(text: string, term: string): boolean {
  return [...text.matchAll(NEGATION)].some((match) => match[1].toLowerCase().includes(term.toLowerCase()));
}

function syndromic(text: string): ClinicalDiagnosisMatch | null {
  const lower = text.toLowerCase();
  if (/\b(?:fever|febrile|pyrexia)\b/.test(lower)) return { diseaseName: "Acute febrile illness", icd10Code: "R50.9", diseaseCategory: "Syndromic", dohNotifiableClass: "not_notifiable", isSensitive: false, sensitiveCategory: null, provisional: false, source: "syndromic" };
  if (/\b(?:cough|runny nose|sore throat|flu-like)\b/.test(lower)) return { diseaseName: "Influenza-like illness", icd10Code: "J11.1", diseaseCategory: "Syndromic", dohNotifiableClass: "not_notifiable", isSensitive: false, sensitiveCategory: null, provisional: false, source: "syndromic" };
  if (/\b(?:diarrhea|diarrhoea|loose stool|vomiting)\b/.test(lower)) return { diseaseName: "Acute diarrheal syndrome", icd10Code: "A09", diseaseCategory: "Diarrheal", dohNotifiableClass: "not_notifiable", isSensitive: false, sensitiveCategory: null, provisional: false, source: "syndromic" };
  return null;
}

/** Classifies assessment text through privacy shielding, modifiers, dictionary matching, then syndromic fallback. */
export function classifyAssessmentText(text: string | null | undefined): ClinicalDiagnosisMatch | null {
  if (!text?.trim()) return null;
  const sensitiveCategory = detectSensitiveCategory(text);
  if (sensitiveCategory) return { diseaseName: "Sensitive diagnosis withheld", icd10Code: null, diseaseCategory: "Syndromic", dohNotifiableClass: "not_notifiable", isSensitive: true, sensitiveCategory, provisional: false, source: "sensitive" };
  const modifiers = detectNegationAndQualifiers(text);
  const match = matchPhilippineSynonym(text);
  const negatedMatch = match
    ? modifiers.negatedTerms.some((term) =>
        match.diseaseName.toLowerCase().split(/\s+/).some((word) => term.toLowerCase().includes(word)),
      ) || /\bR\/O\b/i.test(text)
    : false;
  if (match && !negatedMatch && !isNegated(text, match.diseaseName) && (!match.icd10Code || !isNegated(text, match.icd10Code))) {
    return {
      diseaseName: match.diseaseName,
      icd10Code: match.icd10Code,
      diseaseCategory: match.diseaseCategory,
      dohNotifiableClass: match.dohNotifiableClass,
      isSensitive: false,
      sensitiveCategory: null,
      provisional: modifiers.qualifierTerms.length > 0,
      source: "synonym",
    };
  }
  return match ? null : syndromic(text);
}
