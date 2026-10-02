# MASTER PROMPT: Privacy-Preserving Disease Trend & Epidemiological Surveillance Subsystem
**Monorepo Single-Agent Implementation Engine for Odyssey Healthcare OS**

```text
========================================================================================
                                KICKOFF INSTRUCTION
             (Copy and paste this into Antigravity / Codex to start a session)
========================================================================================
Read disease-trend-surveillance-master-prompt.md in full.
You are executing in SINGLE-AGENT SESSION MODE (avoiding costly multi-agent overhead).

Session Instructions:
Step 1: Check Section 6 ("Implementation Execution Loops") and identify the current Loop
        to execute (Loop 1, Loop 2, Loop 3, Loop 4, or Loop 5).
Step 2: Follow the strict file paths, typing contracts, and regulatory constraints defined
        in Sections 3, 4, and 5.
Step 3: Run validation tests at the end of each loop before committing and stopping.
Step 4: Do not proceed to the next loop without user confirmation.
========================================================================================
```

---

## 1. System Role & Architecture Context

You are the **Lead Clinical Informatics & Privacy Engineer** in the `ODC-Healthchare-OS` monorepo (Next.js 14 App Router, Supabase / PostgreSQL, HL7 FHIR R4 data model, TailwindCSS, TypeScript).

You are engineering an enterprise-grade, privacy-compliant **"Illness/Disease Trend & Epidemiological Surveillance Subsystem"**. This subsystem aggregates clinical morbidity, detects disease outbreaks (e.g., Dengue, Acute Gastroenteritis, Respiratory Infections), maps spatial disease distribution, and generates DOH-compliant reports—**all strictly conforming to the Philippine Data Privacy Act of 2012 (Republic Act No. 10173)**, its Implementing Rules and Regulations (IRR), and related Philippine health statutes.

### Non-Negotiable Architecture Tenets
1. **Single-Agent Cost Efficiency:** Execute sequentially within single-agent sessions. Avoid spawning subagents or running multi-agent swarms.
2. **Privacy by Design (RA 10173):** Diagnostic health data is classified as Sensitive Personal Information (SPI) under Section 3(l). Direct patient identifiers (`name`, `telecom`, `id`, `exact birth date`, `street address`) must **never** leak into analytical views or network payloads.
3. **$k$-Anonymity with Small-Cell Suppression ($k \ge 5$):** Any cell, geographic polygon, or cohort bucket containing fewer than 5 patients must be suppressed or generalized to prevent re-identification through quasi-identifier linkage attacks.
4. **Statutory Sensitive Category Shield (RA 11166 & RA 11036):** HIV/AIDS, psychiatric illness, substance use, and reproductive health conditions are strictly barred from spatial heatmaps and general operational trend views.
5. **Decoupled OLAP Rollup Tables:** The analytics engine must never run heavy analytical aggregation queries against live OLTP tables (`encounters`, `patients`). Pre-aggregated, anonymized database rollups (`disease_surveillance_rollups`) are populated via database-level transactional routines.
6. **Multi-Tenant Isolation:** Clinic A must only see Clinic A's aggregated surveillance trends. Superadmins view macro provincial/national aggregates. All queries enforce Postgres Row-Level Security (RLS).

---

## 2. Forensic Baseline: Current Repository State

Odyssey currently possesses clinical data structures and reference catalogs, but lacks an automated aggregation and privacy-safe surveillance visualization pipeline:

| Component | Current Repository State | Target Privacy-Preserving Architecture |
|---|---|---|
| **Diagnosis Storage** | Structured conditions in `public.conditions` (`20261002010000_pmr_clinical_document_infrastructure.sql`), freeform SOAP in `encounters.diagnosis` JSONB, and assessment notes. | Hybrid extraction pipeline: Extracts freeform impressions, passes through a clinical shorthand dictionary and fuzzy ICD-10 matcher, and outputs normalized ICD-10 codes. |
| **ICD-10 Reference** | 4,800+ PhilHealth Annex A codes in `public.icd10_reference` with `pg_trgm` indexes (`20260927041531_provider_template_maker.sql`). | Utilized as the canonical ontology for fuzzy string matching and morbidity chapter categorization. |
| **Sensitive Health Shield** | Regex-based `detectSensitiveCategory()` in `packages/supabase-client/src/pmr-builder.ts` for PMR document releases. | Reusable core classifier applied upstream to intercept and isolate stigmatized diagnoses before analytical rollup. |
| **Analytics Engine** | Basic operational counts in `apps/admin-web/components/analytics-dashboard.tsx` (appointments, invoices, active staff). | Dedicated epidemiological surveillance engine tracking top morbidities, outbreak thresholds, age/gender distributions, and syndromic indicators. |
| **Geographic Mapping** | Raw address JSONB stored on `patients.address` without geospatial rollup or privacy safeguards. | Pre-aggregated Barangay/Municipality GeoJSON choropleth map with $k \ge 5$ suppression, rate normalization per 10,000 residents, and zoom clamping. |

---

## 3. Regulatory & Legal Specifications (Philippine Jurisdiction)

Every line of code and query must comply with the following statutory requirements:

### 3.1 Republic Act No. 10173 (Data Privacy Act of 2012)
* **Section 3(l) - Sensitive Personal Information (SPI):** Clinical diagnoses, medical history, and symptoms are SPI.
* **Section 4(d) & Section 12/13 - Statistical Exemption:** Processing SPI for statistical, historical, or scientific purposes is lawful **only if** the output is strictly aggregated and anonymized such that individuals are rendered unidentifiable.
* **Section 11 - Proportionality & Data Minimization:** No direct identifiers can be processed by the surveillance engine.

### 3.2 Republic Act No. 11166 (Philippine HIV and AIDS Policy Act)
* **Section 44 - Strict Confidentiality:** Unauthorized disclosure or public linkage of HIV status carries criminal penalties (up to 5 years imprisonment and fines up to ₱500,000).
* **Engineering Mandate:** Any diagnosis containing HIV/AIDS or antiretroviral therapy must be completely masked from clinic-wide disease dashboards and excluded from heatmaps.

### 3.3 Republic Act No. 11036 (Mental Health Act)
* **Section 37 - Confidentiality of Psychiatric Records:** Mental health conditions cannot be displayed on general operational or administrative boards.

### 3.4 Republic Act No. 11332 (Mandatory Reporting of Notifiable Diseases)
* **Statutory Carve-out under DPA Section 13(f):** Clinics are legally mandated to report Category I (immediate within 24 hours, e.g., Rabies, Measles, Mpox) and Category II (weekly, e.g., Dengue, Leptospirosis, Typhoid) diseases to the DOH Epidemiology Bureau.
* **Engineering Mandate:** Segregate the system into two distinct workflows:
  1. *Internal Clinic Trend Dashboard:* 100% anonymized, $k$-anonymous, for general staff and doctors.
  2. *Statutory DOH PIDSR Export:* Encrypted, patient-specific export restricted strictly to the designated Clinic Disease Surveillance Officer (DSO).

---

## 4. Technical Architecture: Freeform NLP & Privacy-Preserving Heatmaps

### 4.1 Freeform SOAP Text-to-Diagnosis Classifier Pipeline
Doctors type shorthand and freeform text in the SOAP Assessment field. The system processes it without human clerical friction:

```
[ Freeform Assessment String ]
  │
  ├─ 1. Isolation Firewall: Strip all personal patient metadata.
  │
  ├─ 2. Sensitive Keyword Scan: Intercept HIV, mental health, STIs (detectSensitiveCategory).
  │
  ├─ 3. Negation & Qualifier Parser: Strip "no", "denies", "ruled out", "T/C", "R/O", "vs".
  │
  ├─ 4. Philippine Clinical Synonym Map:
  │     "AURI" / "URTI" -> J06.9 (Acute Upper Respiratory Infection)
  │     "AGE" / "LBM"   -> A09   (Infectious Gastroenteritis)
  │     "CAP" / "PCAP"  -> J18.9 (Community-Acquired Pneumonia)
  │     "HPN"           -> I10   (Essential Hypertension)
  │     "T2DM"          -> E11.9 (Type 2 Diabetes Mellitus)
  │     "PTB"           -> A15.0 (Pulmonary Tuberculosis)
  │     "Dengue"        -> A90   (Dengue Fever)
  │
  ├─ 5. Trigram Matching: pg_trgm similarity against public.icd10_reference (threshold > 0.4).
  │
  └─ 6. DOH Syndromic Fallback: If symptoms only, tag as AFI, ILI, or Acute Diarrheal Syndrome.
```

### 4.2 Privacy-Preserving Heatmap Architecture
* **Choropleth Administrative Polygons:** Never render continuous point-cloud GPS coordinates. Color-shade official PSA Barangay or City polygons.
* **$k \ge 5$ Cell Suppression:** If a barangay has $< 5$ cases, the count is suppressed (`is_suppressed = true`), rendering as a hatched gray pattern with tooltip `"< 5 cases (Suppressed for Privacy)"`.
* **Incidence Rate Normalization:** Display rate per 10,000 residents based on official census denominators rather than raw headcounts.
* **Zoom-Level Clamping:** Enforce `maxZoom: 13` to prevent street-level or rooftop zooming.
* **Zero Coordinate Leakage in DevTools:** The API server emits only GeoJSON polygon features with aggregated metrics. No latitude/longitude coordinates of patient homes exist in the client payload.

---

## 5. File Ownership & Boundaries

```text
supabase/migrations/
  └── 20261003000100_disease_surveillance_and_epidemiology.sql   # Rollup tables, functions, RLS

packages/types/src/
  ├── surveillance.ts                                             # TypeScript interfaces for trends & heatmaps
  └── index.ts                                                    # Export barrel

packages/supabase-client/src/
  ├── clinical-nlp-classifier.ts                                  # Shorthand dictionary, negation, fuzzy matcher
  ├── surveillance-service.ts                                     # SDK functions for trend rollups & GeoJSON
  └── index.ts                                                    # Client exports

packages/supabase-client/tests/
  ├── clinical-nlp-classifier.test.ts                             # NLP & negation unit tests
  └── surveillance-privacy.test.ts                                # k-anonymity & suppression tests

apps/admin-web/
  ├── app/analytics/disease-trends/page.tsx                       # Admin surveillance dashboard page
  ├── components/disease-trends/
  │     ├── DiseaseTrendDashboard.tsx                             # Main dashboard orchestrator
  │     ├── MorbidityRankingChart.tsx                             # Top 10 diseases bar chart & velocity
  │     ├── EpidemicCurveChart.tsx                                # Weekly epidemic threshold curve
  │     ├── DemographicDistributionChart.tsx                      # Age bracket & gender breakdown
  │     ├── SyndromicSurveillancePanel.tsx                        # Acute febrile / ILI alert indicators
  │     ├── PrivacyChoroplethMap.tsx                              # MapLibre/SVG Barangay choropleth map
  │     └── DohPidsrExportModal.tsx                               # RA 11332 statutory report generator
  └── hooks/use-disease-surveillance.ts                           # React hook with caching & filtering
```

---

## 6. Implementation Execution Loops (One Session Per Loop)

Execute the project across **5 discrete, sequential loops**. Complete each loop in its entirety before proceeding.

---

### Loop 1: Database Foundation, Anonymized Rollup Tables & RLS Policies
**Goal:** Create the database-level storage, aggregation functions, and security boundaries.

1. **Create Migration:** `supabase/migrations/20261003000100_disease_surveillance_and_epidemiology.sql`
   * Create table `public.disease_surveillance_rollups`:
     * `id uuid primary key default gen_random_uuid()`
     * `organization_id uuid not null references public.organizations(id) on delete cascade`
     * `epi_year smallint not null`
     * `epi_week smallint not null check (epi_week between 1 and 53)`
     * `icd10_code text not null`
     * `disease_name text not null`
     * `doh_category text not null` (e.g., 'Acute Respiratory', 'Vector-borne', 'Diarrheal', 'Cardiovascular', 'Syndromic')
     * `age_bracket text not null check (age_bracket in ('infant_under_1', 'child_1_to_4', 'school_5_to_14', 'reproductive_15_to_49', 'middle_50_to_64', 'senior_65_plus', 'unknown'))`
     * `gender text check (gender in ('male', 'female', 'other', 'unknown'))`
     * `municipality text`
     * `barangay text`
     * `case_count integer not null check (case_count >= 0)`
     * `is_suppressed boolean not null default false` (true if `case_count < 5`)
     * `created_at timestamptz not null default now()`
     * Unique constraint on `(organization_id, epi_year, epi_week, icd10_code, age_bracket, gender, coalesce(municipality, ''), coalesce(barangay, ''))`
   * Create table `public.disease_surveillance_audit_log`:
     * Tracks exports, views, and DOH statutory report releases with actor ID, purpose, and timestamp.
2. **Postgres Functions & Trigger:**
   * Function `public.calculate_epi_week(timestamp with time zone) returns smallint`:
     * Computes official ISO-8601 Epidemiological Week.
   * Function `public.categorize_age_bracket(date) returns text`:
     * Maps birth dates into standard DOH FHSIS cohorts without storing exact ages.
   * Stored Procedure `public.refresh_disease_surveillance_rollups(p_organization_id uuid, p_start_date timestamptz, p_end_date timestamptz)`:
     * Runs with `SECURITY DEFINER` and `search_path = ''`.
     * Ingests from `conditions` and `encounters`, categorizes, aggregates, and automatically applies `is_suppressed = true` whenever `case_count < 5`.
     * Excludes conditions where `is_sensitive = true` or matching sensitive categories.
3. **RLS Policies:**
   * Enable RLS on `disease_surveillance_rollups`.
   * Restrict reads to authenticated users belonging to the tenant organization (or platform superadmins).
   * Prohibit direct `INSERT`, `UPDATE`, or `DELETE` from authenticated client roles (aggregates are read-only and maintained by database functions).
4. **Verification Gate:**
   * Run migration against Supabase database.
   * Verify table creation, RLS enforcement, and trigger behavior using deterministic seed data.

---

### Loop 2: Clinical Freeform Text-to-Diagnosis Classifier & Dictionary Engine
**Goal:** Build the TypeScript classifier that extracts diagnoses from freeform text, filters sensitive categories, and normalizes ICD-10 codes.

1. **Create Types:** `packages/types/src/surveillance.ts`
   * Define `ClinicalDiagnosisMatch`, `DiseaseCategory`, `AgeBracket`, `EpiTrendDataPoint`, `SpatialChoroplethFeature`, `DohNotifiableClass`.
   * Export from `packages/types/src/index.ts`.
2. **Implement NLP Classifier:** `packages/supabase-client/src/clinical-nlp-classifier.ts`
   * Method `extractClinicalImpression(soapText: string): string | null`: Extracts Assessment line using regex.
   * Method `detectNegationAndQualifiers(text: string)`: Identifies "no", "denies", "ruled out", "T/C", "R/O", "probable", "vs".
   * Method `matchPhilippineSynonym(text: string)`: Deterministic matching for 50+ Philippine clinical abbreviations (`AURI`, `AGE`, `HPN`, `T2DM`, `CAP`, `PCAP`, `PTB`, `Dengue`, `UTI`, `GERD`).
   * Method `classifyAssessmentText(assessmentText: string)`: Orchestrates negation, synonym match, sensitive keyword shielding (`detectSensitiveCategory`), and syndromic fallback.
3. **Automated Unit Tests:** `packages/supabase-client/tests/clinical-nlp-classifier.test.ts`
   * Test 1: Slashes/qualifiers: `"T/C Dengue with warning signs"` -> matches Dengue, provisional = true.
   * Test 2: Negation: `"Patient has cough, but negative for Dengue"` -> Dengue is discarded.
   * Test 3: Sensitive shielding: `"Major depressive disorder with suicidal ideation"` -> flags `isSensitive: true`, category `mental_health`.
   * Test 4: Local abbreviations: `"Pedia PCAP-C"` -> matches Pneumonia (ICD-10 `J18.9`).
4. **Verification Gate:**
   * Run `pnpm --filter @odyssey/supabase-client test`. Confirm 100% test pass rate.

---

### Loop 3: Supabase Client SDK, Aggregation Services & Privacy API Contract
**Goal:** Expose client SDK methods that query rollups and generate privacy-safe GeoJSON payloads.

1. **Implement SDK Service:** `packages/supabase-client/src/surveillance-service.ts`
   * `getMorbidityTrends(client, options: { organizationId, epiYear, limit? })`: Returns top 10 diseases with week-over-week growth velocity.
   * `getEpidemicCurve(client, options: { organizationId, icd10Code, weeks? })`: Returns weekly historical volume vs. 5-week moving average and epidemic alert threshold.
   * `getDemographicBreakdown(client, options: { organizationId, icd10Code })`: Returns age bracket and gender distributions with $k < 5$ suppression badges.
   * `getBarangayChoroplethData(client, options: { organizationId, icd10Code, epiYear, epiWeek })`: Returns GeoJSON features for barangays. **CRITICAL:** Enforces zero point-level coordinate output.
2. **Export Client Methods:** Add to `packages/supabase-client/src/index.ts`.
3. **Privacy Assurance Tests:** `packages/supabase-client/tests/surveillance-privacy.test.ts`
   * Verify that cells with $< 5$ cases return `is_suppressed = true` and `case_count = null` (or 0).
   * Verify that GeoJSON payloads contain polygon geometries only, with zero `lat`/`lng` coordinate pairs for individuals.
   * Verify that requesting sensitive categories returns a privacy rejection error.
4. **Verification Gate:**
   * Run test suite; confirm SDK methods execute cleanly with proper TypeScript typing.

---

### Loop 4: Operational Trend Analytics UI (Admin Web & Provider Web)
**Goal:** Build the interactive clinical surveillance dashboard in Next.js.

1. **Create Hook:** `apps/admin-web/hooks/use-disease-surveillance.ts`
   * Handles tenant context, year/week selection, active disease filter, loading states, and SWR-style caching.
2. **Build UI Components:** `apps/admin-web/components/disease-trends/`
   * `MorbidityRankingChart.tsx`: High-aesthetic horizontal bar chart showing top 10 illnesses, percentage share, and trend badge (Rising / Stable / Declining).
   * `EpidemicCurveChart.tsx`: Area chart showing current season cases against epidemic threshold lines (endemic channel / alert threshold).
   * `DemographicDistributionChart.tsx`: Stacked bar chart across DOH age brackets (`<1`, `1-4`, `5-14`, `15-49`, `50-64`, `65+`) and gender.
   * `SyndromicSurveillancePanel.tsx`: KPI cards tracking acute febrile illness, influenza-like illness, and acute diarrhea spikes.
3. **Assemble Main Dashboard:** `apps/admin-web/app/analytics/disease-trends/page.tsx`
   * Accessible via navigation under `ANALYTICS & GOVERNANCE`.
   * Add breadcrumb, period filters, and PDF export action.
4. **Verification Gate:**
   * Build `apps/admin-web` (`pnpm --filter admin-web build`); ensure zero TypeScript or JSX compile errors.

---

### Loop 5: Privacy-Preserving Geospatial Heatmap & DOH Export Engine
**Goal:** Implement the boundary choropleth map, zoom-level clamps, and statutory DOH export modal.

1. **Implement Choropleth Map Component:** `apps/admin-web/components/disease-trends/PrivacyChoroplethMap.tsx`
   * Lightweight SVG/GeoJSON or MapLibre renderer with official Philippine PSA Barangay geometries.
   * Color shading reflects Attack Rate per 10,000 population:
     * Green: Normal / Basal (< 5.0 per 10k)
     * Yellow: Alert (5.0 - 15.0 per 10k)
     * Red: Epidemic (> 15.0 per 10k)
     * Gray diagonal hatch: Suppressed ($k < 5$ cases)
   * Hard clamp: `maxZoom: 13`. Displays privacy alert if user attempts street-level inspection.
   * Blacklist check: Disables spatial map if an SPI category is selected.
2. **Statutory DOH PIDSR Export Modal:** `apps/admin-web/components/disease-trends/DohPidsrExportModal.tsx`
   * Strictly gated to users with `can_export_epidemiology_records` role permission.
   * Formats notifiable disease cases (Category I & II under RA 11332) into the official DOH Case Investigation Form (CIF) schema.
   * Logs every export event immutably to `public.disease_surveillance_audit_log`.
3. **End-to-End Validation:**
   * Verify all 5 loops function cohesively.
   * Validate that the browser network tab never receives patient IDs or street coordinates.
4. **Final Gate:**
   * Run full monorepo build and test suite (`pnpm turbo build test`).

---

## 7. Operational Guidelines for the Developer

1. **Do not use multi-agent commands.** Implement the changes directly in your current session.
2. **Work sequentially.** Complete Loop 1 before touching Loop 2.
3. **Test continuously.** Never declare a loop complete without running the corresponding automated tests.
4. **Preserve existing database data.** Use safe `if not exists` and backward-compatible migrations.
