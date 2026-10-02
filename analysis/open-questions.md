# Odyssey Healthcare OS — Strategic Impact & System Decisions Log

This document consolidates key operational, clinical, and regulatory decisions identified during the codebase audit of **Odyssey Healthcare OS**. In alignment with Odyssey's public health mission, this document focuses strictly on **patient equity (PhilHealth No Balance Billing / UHC)**, **healthcare worker empowerment**, and **institutional delivery for Philippine public facilities (RHUs, District Hospitals, and Provincial Apex Centers)**—excluding commercial monetization models.

---

## 1. Clinical & Public Health Impact Benchmarks

To evaluate the system's human and operational impact across pilot Philippine health facilities, the following indicators should be measured against legacy paper-based workflows:

| Impact Dimension | Legacy Baseline (Paper / Siloed Systems) | Odyssey OS Target Metric | Evidence Base in Code |
|---|---|---|---|
| **Outpatient Wait Times** | 2 to 4 hours in physical lines at public hospital OPDs | **< 30 minutes** via pre-booked triage and live digital queue dispatch | `apps/patient-web/src/app/book`, `apps/provider-web/src/app/queue` |
| **No Balance Billing (NBB) Compliance** | Fragmented; indigent patients often forced to buy medicines outside due to stockouts | **100% automated NBB flag** ensuring zero out-of-pocket billing for covered hospital care | `apps/admin-web/src/app/billing/page.tsx`, `invoices`, `insurance_claims` |
| **Duplicate Laboratory Tests** | High frequency; referrals between RHUs and hospitals lack prior test history | **Zero duplicate tests**; longitudinal EHR accessible across facilities in the network | `fhir_resources`, `encounters`, `diagnostic_reports` |
| **Nurse & Doctor Documentation Burden** | 15–20 minutes of paper charting per consultation | **< 3 minutes** with single-screen tri-service triage and pre-structured clinical forms | `apps/provider-web/src/app/queue/page.tsx` |
| **Public Pharmacy Stockouts** | Frequent stockouts of vital antihypertensives, antibiotics, and vaccines | **Automated low-stock threshold alerts** and real-time inventory tracking across departments | `apps/admin-web/src/app/inventory/page.tsx`, `inventory_items` |

---

## 2. Deep Dive: PhilHealth No Balance Billing (NBB) & Universal Health Care (RA 11223)

Republic Act No. 11223 (Universal Health Care Act) mandates that all Filipinos are automatically enrolled in the National Health Insurance Program, with vulnerable populations (indigents, sponsored members, senior citizens, PWDs, 4Ps beneficiaries) entitled to **No Balance Billing (NBB)**—meaning zero co-payment or out-of-pocket charges in accredited public ward beds.

### Key Decisions for NBB Implementation in Odyssey:

### Decision 2.1: Automated Real-time Eligibility Verification
- **Current State:** The billing module (`apps/admin-web/src/app/billing/page.tsx`) supports an `nbb_eligible` boolean flag on invoices and records PhilHealth member numbers.
- **Workflow Decision:** How should Odyssey interface with the PhilHealth Member Portal or electronic verification services?
  - *Recommendation:* Introduce an automated point-of-care PhilHealth pin verification step during patient triage. If a patient is flagged as indigent/sponsored or admitted to a public ward, the system automatically locks the out-of-pocket balance to `₱0.00` and routes all itemized pharmaceutical and laboratory costs directly to the facility's PhilHealth case rate allocation.

### Decision 2.2: Preventing "Hidden" Out-of-Pocket Costs for Indigents
- **System Reality:** In many Philippine public hospitals, even if a patient qualifies for NBB, hospital pharmacy stockouts force families to buy IV fluids, antibiotics, or surgical supplies out-of-pocket from nearby commercial drugstores.
- **Odyssey Solution:** Connect `apps/admin-web/src/app/inventory` directly to `apps/admin-web/src/app/billing`:
  - When a doctor prescribes medication in `apps/provider-web`, the system immediately verifies stock availability in the hospital central pharmacy.
  - If stock is critical, the pharmacy supervisor receives an automated dispatch alert to reorder from provincial depots before a stockout occurs, preserving true zero-cost care for vulnerable patients.

### Decision 2.3: PhilHealth Konsulta Package Integration for Primary Care (RHUs)
- **Context:** The PhilHealth Konsulta program pays accredited municipal health units an annual capitation fee per registered member for essential consultations, basic lab tests, and 21 maintenance drugs.
- **Decision:** Align Odyssey's patient registry and clinical encounter schema (`fhir_resources`, `encounters`) with the DOH and PhilHealth Konsulta reporting standard, allowing Rural Health Units (RHUs) to track accredited Konsulta patient visits and claim capitation subsidies effortlessly.

---

## 3. Empowering Healthcare Workers & Combating Burnout

Healthcare workers in Philippine public institutions face intense workloads, high patient-to-staff ratios, and administrative exhaustion. Odyssey's interface is engineered to eliminate paper bottlenecks and protect clinical staff:

### Decision 3.1: Tri-Service Clinical Workflows (In-Person, Telehealth, Home Health)
- **Current State:** The provider queue (`apps/provider-web/src/app/queue/page.tsx`) provides tabbed filtering for In-Person, Telehealth, and Home Health consultations.
- **Workflow Decision:** How should Barrio Health Workers (BHWs) and rural health midwives interface with doctors for home care and island barangays?
  - *Workflow:* Midwives and BHWs use mobile-responsive Odyssey triage forms during community home visits. High-risk cases are immediately routed into the district hospital doctor's queue as a scheduled Telehealth or Home Care escalation.

### Decision 3.2: Role-Based Access Control (RBAC) & Medicolegal Protection
- **Current State:** The roles module (`apps/admin-web/src/app/roles/page.tsx`) provides 34 discrete granular permissions across 5 default system roles (Super Admin, Facility Admin, Doctor, Nurse, Staff).
- **Clinical Benefit:** Guarantees that nursing staff, medical technologists, and pharmacists have clear digital scopes of practice. Doctor prescription signatures, triage vital signs, and medication dispenses are immutably logged with audit trails, providing comprehensive legal protection and institutional accountability.

---

## 4. Edge Resilience & Interoperability for Island Provinces

### Decision 4.1: Offline-First Operation for GIDA (Geographically Isolated & Disadvantaged Areas)
- **Challenge:** Many municipal RHUs and island clinics face routine power outages and intermittent cellular connectivity.
- **Technical Strategy:** Implement an offline-first PWA mode for `apps/provider-web` and `apps/patient-web`. Consultations, triage notes, and pharmacy logs recorded offline are cached locally in IndexedDB/SQLite and reconciled automatically via Supabase Realtime when internet connectivity is re-established.

### Decision 4.2: DOH Unified Health Information System (UHIS) & FHIR Alignment
- **Architecture:** Odyssey's database is natively built around FHIR-compliant entities (`fhir_resources`, `encounters`, `patients`, `practitioners`).
- **Strategic Direction:** Ensure the FHIR export pipeline complies with DOH-PhilHealth Joint Administrative Order (JAO) standards for the Philippine National Health Data Dictionary, facilitating seamless data exchange with provincial apex hospitals and national epidemiology registries.
