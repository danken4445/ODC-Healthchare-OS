import type {
  InventoryWorkspace,
  LaboratoryServiceSummary,
  SpecialistOption,
} from "@odyssey/types";

export interface TriageTestProfile {
  systolicBp: number;
  diastolicBp: number;
  pulseBpm: number;
  respiratoryRate: number;
  temperatureC: number;
  oxygenSaturation: number;
  weightKg: number;
  heightCm: number;
  painScore: number;
  acuity: "routine" | "urgent" | "emergency";
  chiefComplaint: string;
  notes: string;
}

export interface ClinicalTestProfile {
  id: string;
  name: string;
  category: string;
  soap: string;
  triage: TriageTestProfile;
  prescription: {
    medication: string;
    dosage: string;
    note: string;
  };
  certificate: {
    title: string;
    statement: string;
  };
  laboratory: {
    priority: "routine" | "urgent" | "asap" | "stat";
    note: string;
  };
  referral: {
    priority: "routine" | "urgent" | "asap";
    note: string;
  };
  inventory: {
    quantity: number;
  };
}

export const CLINICAL_TEST_PROFILES: ClinicalTestProfile[] = [
  {
    id: "urti-pharyngitis",
    name: "Acute Upper Respiratory Infection & Pharyngitis",
    category: "Infectious / ENT",
    triage: {
      systolicBp: 118,
      diastolicBp: 76,
      pulseBpm: 82,
      respiratoryRate: 18,
      temperatureC: 37.8,
      oxygenSaturation: 99,
      weightKg: 64.5,
      heightCm: 165,
      painScore: 3,
      acuity: "routine",
      chiefComplaint: "Sore scratchy throat for 3 days, low-grade fever, runny nose, and dry cough.",
      notes: "Ambulatory and alert. Mild hoarseness noted. Oropharynx mildly erythematous. Directed to priority waiting area.",
    },
    soap: `Subjective:
Patient is a 32-year-old presenting with a 3-day history of scratchy throat, low-grade fever (T-max 38.1°C), clear rhinorrhea, and intermittent dry cough. Reports mild myalgia and fatigue. Denies shortness of breath, chest tightness, hemoptysis, or dysphagia. Denies known sick contacts or recent travel. Has taken OTC paracetamol with mild transient relief.

Objective:
Vitals: BP: 118/76 mmHg, HR: 82 bpm, RR: 18 cpm, Temp: 37.8°C, SpO2: 99% on room air.
General: Alert, oriented, mild voice hoarseness, in no acute respiratory distress.
HEENT: Normocephalic, conjunctivae pink, sclerae anicteric. Posterior pharyngeal wall erythematous with tonsillar enlargement (2+), no tonsillar exudates or membrane. Uvula midline. No tender cervical lymphadenopathy.
Chest/Lungs: Clear vesicular breath sounds bilaterally, no crackles or wheezing.
CVS: Regular rate and rhythm, normal S1/S2, no murmurs.
Abdomen: Soft, non-tender, normoactive bowel sounds.

Assessment:
1. Acute Upper Respiratory Tract Infection (ICD-10: J06.9)
2. Acute Pharyngitis, presumed viral etiology (ICD-10: J02.9)

Plan:
1. Symptomatic relief: Paracetamol 500mg PO q6h PRN for fever/pain; Cetirizine 10mg PO OD at bedtime for 5 days.
2. Non-pharmacologic: Warm saline gargles 3-4x daily, adequate oral hydration (2.5L/day), voice rest.
3. Precautions: Return immediately if dyspnea, high continuous fever (>39°C), or inability to swallow fluids occurs.
4. Excuse from work duties for 3 days; follow-up in 5 days if unresolved.`,
    prescription: {
      medication: "Cetirizine Dihydrochloride 10mg Film-Coated Tablet",
      dosage: "Take 1 tablet by mouth once daily at bedtime for 5 consecutive days.",
      note: "May cause mild drowsiness. Avoid driving or operating heavy machinery.",
    },
    certificate: {
      title: "Medical Certificate - Home Recuperation",
      statement: "This is to certify that the patient was evaluated today and diagnosed with Acute Upper Respiratory Tract Infection with Pharyngitis. The patient is advised 3 calendar days of home rest and is excused from work/school duties.",
    },
    laboratory: {
      priority: "routine",
      note: "Complete Blood Count (CBC) with differential count to rule out secondary bacterial infection.",
    },
    referral: {
      priority: "routine",
      note: "Referral to ENT Specialist if pharyngeal symptoms persist beyond 7 days or if peritonsillar fullness develops.",
    },
    inventory: {
      quantity: 1,
    },
  },
  {
    id: "hypertension-stage2",
    name: "Essential Hypertension Stage 2 & Tension Cephalea",
    category: "Cardiovascular",
    triage: {
      systolicBp: 154,
      diastolicBp: 96,
      pulseBpm: 76,
      respiratoryRate: 16,
      temperatureC: 36.7,
      oxygenSaturation: 98,
      weightKg: 78.2,
      heightCm: 172,
      painScore: 5,
      acuity: "urgent",
      chiefComplaint: "Throbbing occipital headache and posterior neck stiffness for 2 weeks.",
      notes: "Elevated BP verified on both arms. Patient reports missing evening anti-hypertensive medication for 4 days. Denies chest pain or visual changes.",
    },
    soap: `Subjective:
Patient is a 48-year-old presenting with recurrent late-afternoon throbbing occipital headache and posterior neck tightness for the past 2 weeks. Associated with mild workplace fatigue. Denies visual blurring, scotomas, palpitations, chest pain, orthopnea, or focal limb weakness. Known hypertensive for 3 years with irregular compliance to previous anti-hypertensive therapy.

Objective:
Vitals: BP: 154/96 mmHg (verified on right and left arm), HR: 76 bpm, RR: 16 cpm, Temp: 36.7°C, SpO2: 98% room air. BMI: 27.6 kg/m².
General: Well-nourished, comfortable, conversant, alert and oriented x3.
HEENT: Pupils equal, round, reactive to light (3mm). Sclerae anicteric. No carotid bruits.
Neck: Mild paraspinal muscle tenderness along upper trapezius, full passive and active range of motion.
Chest/Lungs: Clear breath sounds throughout, no rales.
CVS: S1 and S2 present, regular rhythm, no S3 gallop, no pedal edema.
Neurologic: Cranial nerves II-XII intact, motor strength 5/5 in all extremities, sensation preserved.

Assessment:
1. Essential (Primary) Hypertension, Stage 2 (ICD-10: I10)
2. Tension-type headache secondary to elevated systemic vascular resistance / stress (ICD-10: G44.2)

Plan:
1. Pharmacotherapy: Initiate Losartan Potassium 50mg PO once daily in the morning; Amlodipine 5mg PO once daily. Paracetamol 500mg PO q8h PRN for severe cephalalgia.
2. Lifestyle modification: Low-sodium DASH diet (<2g sodium/day), stress reduction, 30 min daily aerobic walking.
3. Diagnostics: Request Fasting Blood Sugar, Lipid Profile, Serum Creatinine, and 12-lead ECG.
4. Home BP monitoring: Maintain a morning and evening BP log.
5. Follow-up in 2 weeks for blood pressure re-evaluation and medication titration.`,
    prescription: {
      medication: "Losartan Potassium 50mg Film-Coated Tablet",
      dosage: "Take 1 tablet by mouth once daily in the morning with water.",
      note: "Take at the same time each morning. Monitor and log daily resting blood pressure.",
    },
    certificate: {
      title: "Medical Certificate - Clinical Evaluation Clearance",
      statement: "This certifies that the patient underwent clinical evaluation and management for Stage 2 Essential Hypertension. Patient is cleared for sedentary desk duties with instructions for strict medication adherence and follow-up.",
    },
    laboratory: {
      priority: "routine",
      note: "Fasting Blood Sugar, Lipid Profile, Serum Creatinine, and Routine Urinalysis to evaluate cardiovascular and renal baselines.",
    },
    referral: {
      priority: "routine",
      note: "Referral to Cardiology for cardiovascular risk stratification and optimization of anti-hypertensive regimen.",
    },
    inventory: {
      quantity: 1,
    },
  },
  {
    id: "acute-gastroenteritis",
    name: "Acute Gastroenteritis with Mild Dehydration",
    category: "Gastroenterology",
    triage: {
      systolicBp: 106,
      diastolicBp: 70,
      pulseBpm: 92,
      respiratoryRate: 18,
      temperatureC: 37.5,
      oxygenSaturation: 99,
      weightKg: 56.0,
      heightCm: 160,
      painScore: 4,
      acuity: "urgent",
      chiefComplaint: "Watery diarrhea (5 episodes) and crampy abdominal pain since yesterday.",
      notes: "Dry oral mucous membranes noted. Patient states stomach cramps worsen after drinking cold water. Provided ORS sachet in waiting area.",
    },
    soap: `Subjective:
Patient is a 24-year-old presenting with acute onset of watery, non-bloody diarrhea (5 episodes over 18 hours), accompanied by crampy lower abdominal pain, nausea, and two episodes of non-bilious emesis. Reports consuming street food yesterday. Reports dark urine and thirst. Denies hematochezia, melena, or high fever.

Objective:
Vitals: BP: 106/70 mmHg, HR: 92 bpm, RR: 18 cpm, Temp: 37.5°C, SpO2: 99% on room air.
General: Mildly dehydrated, dry oral mucosa, skin turgor slightly diminished.
Abdomen: Flat, soft, diffuse tenderness on palpation over periumbilical region, no muscular guarding, no rebound tenderness. Hyperactive bowel sounds heard on auscultation (borborygmi).
CVS: Regular tachycardia, no murmurs.
Lungs: Clear to auscultation bilaterally.

Assessment:
1. Acute Gastroenteritis, presumed infectious / foodborne (ICD-10: A09)
2. Mild Dehydration secondary to gastrointestinal fluid losses (ICD-10: E86.0)

Plan:
1. Rehydration: Oral Rehydration Salts (ORS) - 1 sachet in 200mL clean water after every loose stool. Minimum 2.5L daily fluids.
2. Pharmacotherapy: Zinc sulfate 20mg PO OD x 14 days; Hyoscine-N-butylbromide 10mg PO q8h PRN for abdominal cramps; Probiotic sachet PO BID.
3. Dietary advice: BRAT diet (bananas, rice, applesauce, toast); strictly avoid dairy, oily, and spicy food.
4. Warning signs: Proceed to emergency room if intractable vomiting, high fever, or hematochezia occurs.
5. Excused from work duties for 2 days. Follow up in 48 hours.`,
    prescription: {
      medication: "Oral Rehydration Salts (ORS) Powder Sachet",
      dosage: "Dissolve 1 sachet in 200mL clean drinking water; drink after each loose bowel movement.",
      note: "Continue drinking fluids throughout the day. Discard any reconstituted solution after 24 hours.",
    },
    certificate: {
      title: "Medical Certificate - Medical Leave",
      statement: "This certifies that the patient was diagnosed and treated for Acute Gastroenteritis with mild dehydration on this date. The patient is unfit for occupational duties and is granted 2 days of excused medical rest.",
    },
    laboratory: {
      priority: "urgent",
      note: "Routine Stool Fecalysis with Occult Blood and Urinalysis to assess specific gravity and rule out invasive pathogens.",
    },
    referral: {
      priority: "urgent",
      note: "Referral to Gastroenterologist if diarrhea persists beyond 72 hours or signs of systemic toxicity appear.",
    },
    inventory: {
      quantity: 2,
    },
  },
  {
    id: "type2-diabetes",
    name: "Type 2 Diabetes Mellitus & Peripheral Neuropathy Screening",
    category: "Endocrinology",
    triage: {
      systolicBp: 126,
      diastolicBp: 82,
      pulseBpm: 72,
      respiratoryRate: 16,
      temperatureC: 36.6,
      oxygenSaturation: 98,
      weightKg: 74.0,
      heightCm: 168,
      painScore: 2,
      acuity: "routine",
      chiefComplaint: "Quarterly diabetes follow-up and burning/tingling sensation in both feet.",
      notes: "Patient alert and seated comfortably. Reports compliant medication intake. Fasting since midnight for scheduled morning laboratory work.",
    },
    soap: `Subjective:
Patient is a 56-year-old known Type 2 Diabetic for 7 years presenting for routine 3-month review and medication refill. Reports occasional tingling and burning sensation in bilateral feet and toes, worse at night. Denies chest pain, shortness of breath, polyuria, polydipsia, or visual changes. Reports fair adherence to Metformin and dietary restrictions.

Objective:
Vitals: BP: 126/82 mmHg, HR: 72 bpm, RR: 16 cpm, Temp: 36.6°C, SpO2: 98%. BMI: 28.1 kg/m².
General: Alert, comfortable, in no distress.
HEENT: Anicteric sclerae, pink conjunctivae.
Extremities: Bilateral peripheral pulses (dorsalis pedis and posterior tibial) 2+ palpable. Semmes-Weinstein 10g monofilament exam demonstrates reduced light touch sensation over plantar aspect of both great toes. No skin breakdown, ulcerations, or calluses.
CVS: S1/S2 normal, regular rhythm.
Lungs: Clear to auscultation bilaterally.

Assessment:
1. Type 2 Diabetes Mellitus, non-insulin dependent (ICD-10: E11.9)
2. Diabetic Peripheral Neuropathy, early sensory (ICD-10: E11.40)

Plan:
1. Antidiabetic: Continue Metformin 500mg PO BID with meals. Consider adding DPP-4 inhibitor if HbA1c remains > 7.5%.
2. Neuropathy management: Gabapentin 100mg PO QHS; Vitamin B-complex 1 tablet PO OD.
3. Diabetic foot care: Daily foot inspection, moisturize skin, avoid barefoot walking.
4. Laboratory orders: HbA1c, Fasting Lipid Profile, Spot Urine Albumin-to-Creatinine Ratio (UACR).
5. Referral: Scheduled for annual dilated funduscopy exam with Ophthalmology.
6. Follow-up in 1 month with laboratory test results.`,
    prescription: {
      medication: "Metformin Hydrochloride 500mg Film-Coated Tablet",
      dosage: "Take 1 tablet by mouth twice daily with meals (morning and evening).",
      note: "Take with food to minimize gastrointestinal discomfort. Do not skip meals.",
    },
    certificate: {
      title: "Medical Certificate - Periodic Medical Evaluation",
      statement: "This is to certify that the patient underwent periodic clinical monitoring for Type 2 Diabetes Mellitus. Patient remains stable and fit to continue regular occupational duties.",
    },
    laboratory: {
      priority: "routine",
      note: "Glycated Hemoglobin (HbA1c), Fasting Blood Sugar, Lipid Profile, and Spot Urine Albumin-to-Creatinine Ratio.",
    },
    referral: {
      priority: "routine",
      note: "Referral to Endocrinologist / Ophthalmologist for comprehensive diabetic retinopathy screening and glycemic optimization.",
    },
    inventory: {
      quantity: 1,
    },
  },
  {
    id: "lumbar-strain",
    name: "Acute Lumbosacral Muscular Strain",
    category: "Musculoskeletal",
    triage: {
      systolicBp: 122,
      diastolicBp: 78,
      pulseBpm: 74,
      respiratoryRate: 16,
      temperatureC: 36.5,
      oxygenSaturation: 99,
      weightKg: 81.5,
      heightCm: 177,
      painScore: 6,
      acuity: "routine",
      chiefComplaint: "Acute lower back stiffness and severe pain after lifting heavy storage boxes.",
      notes: "Patient walking with guarded, antalgic gait. Hand placed on lower lumbar spine. Offered wheelchair but preferred slow walking.",
    },
    soap: `Subjective:
Patient is a 38-year-old presenting with acute lower back pain that started yesterday after lifting heavy storage boxes at work. Describes pain as a dull, aching tightness across the lumbosacral region rated 6/10 in severity, exacerbated by bending forward or standing from a seated position. Denies radiating pain to thighs, numbness, paresthesias, or changes in bowel/bladder habits.

Objective:
Vitals: BP: 122/78 mmHg, HR: 74 bpm, RR: 16 cpm, Temp: 36.5°C.
General: Mildly antalgic gait, uses hand on lumbar area for support when rising from chair.
Musculoskeletal: Tenderness to palpation along bilateral lumbar paraspinal muscles with palpable muscle spasm. No midline spinal process tenderness. Lumbar flexion limited to 45 degrees due to discomfort.
Neurologic: Straight Leg Raise (SLR) test negative bilaterally up to 80 degrees. Deep tendon reflexes (patellar and Achilles) 2+ symmetric. Lower extremity motor strength 5/5 throughout. Intact sensation in L3-S1 dermatomes.

Assessment:
1. Acute Musculoskeletal Lumbar Strain with Paraspinal Muscle Spasm (ICD-10: M54.50)

Plan:
1. Pharmacotherapy: Celecoxib 200mg PO once daily after meals x 7 days; Eperisone HCl 50mg PO TID after meals x 5 days.
2. Non-pharmacologic: Apply ice pack 15 mins every 3-4 hours for first 48 hours, then alternate with warm compress. Avoid complete bed rest; encourage gentle walking.
3. Ergonomics: Proper lifting techniques, avoid heavy loads (>5 kg) for 10 days.
4. Physical therapy referral if symptoms persist beyond 2 weeks.
5. Excused from manual lifting duties for 4 days.`,
    prescription: {
      medication: "Celecoxib 200mg Capsule",
      dosage: "Take 1 capsule by mouth once daily after a meal for 7 consecutive days.",
      note: "Take with food. Discontinue and contact clinic if epigastric pain or dark stools occur.",
    },
    certificate: {
      title: "Medical Certificate - Light Duty / Lifting Restriction",
      statement: "This is to certify that the patient was evaluated for acute lumbar muscle strain. Patient is advised to refrain from heavy manual lifting (>5 kg) and strenuous physical activities for 4 calendar days.",
    },
    laboratory: {
      priority: "routine",
      note: "Lumbosacral Spine X-Ray (AP and Lateral views) if radicular signs emerge or lack of clinical improvement after conservative therapy.",
    },
    referral: {
      priority: "routine",
      note: "Referral to Physical Medicine and Rehabilitation (Physiatry) for directed lumbar spine physical therapy and strengthening.",
    },
    inventory: {
      quantity: 1,
    },
  },
  {
    id: "bronchial-asthma",
    name: "Bronchial Asthma in Mild Acute Exacerbation",
    category: "Pulmonology",
    triage: {
      systolicBp: 116,
      diastolicBp: 74,
      pulseBpm: 88,
      respiratoryRate: 20,
      temperatureC: 36.8,
      oxygenSaturation: 97,
      weightKg: 62.0,
      heightCm: 163,
      painScore: 3,
      acuity: "urgent",
      chiefComplaint: "Chest tightness, nighttime coughing, and mild wheezing for 2 days.",
      notes: "Mild expiratory wheezes audible on deep breathing. Speaks in complete sentences without gasping. Inhaler canister in hand.",
    },
    soap: `Subjective:
Patient is a 29-year-old with known history of bronchial asthma presenting with a 2-day history of chest tightness, nighttime coughing, and mild audible wheezing following a mild cold. Reports using rescue inhaler twice in the past 24 hours with partial relief. Denies fever, purulent sputum, chest pain, or hemoptysis. No history of ICU admissions or intubation for asthma.

Objective:
Vitals: BP: 116/74 mmHg, HR: 88 bpm, RR: 20 cpm, Temp: 36.8°C, SpO2: 97% on room air.
General: Alert, speaks in full sentences, mild end-expiratory effort, no suprasternal retractions.
HEENT: Clear nasal turbinates, pale mucosa.
Lungs: Expiratory wheezes heard bilaterally over lung fields, no crackles, good air entry.
Heart: S1/S2 present, regular rhythm, no murmurs.
Peak Expiratory Flow (PEF): 380 L/min (approx 80% of personal best).

Assessment:
1. Bronchial Asthma in mild acute exacerbation, triggered by viral URTI (ICD-10: J45.21)

Plan:
1. Bronchodilator: Salbutamol 100mcg inhaler 2 puffs q4-6h PRN for wheezing or dyspnea.
2. Inhaled Corticosteroid: Budesonide/Formoterol 160/4.5mcg 1 inhalation BID for 14 days.
3. Asthma Action Plan reviewed: Green/Yellow/Red zone parameters emphasized.
4. Triggers: Avoid cold beverages, dust mites, strong perfumes, and smoke exposure.
5. Return immediately to emergency if persistent severe breathlessness, inability to speak full sentences, or blue lips/fingernails occur.
6. Follow up in 1 week for peak flow and symptom review.`,
    prescription: {
      medication: "Salbutamol 100mcg Metered Dose Inhaler",
      dosage: "Inhale 2 puffs every 4 to 6 hours as needed for chest tightness or wheezing.",
      note: "Rinse mouth thoroughly with water after inhalation. Shake canister well before each actuation.",
    },
    certificate: {
      title: "Medical Certificate - Medical Clearance and Home Rest",
      statement: "This certifies that the patient was attended to for an acute asthma exacerbation. Recommended 2 days of home rest and strict adherence to prescribed inhaler regimen.",
    },
    laboratory: {
      priority: "routine",
      note: "Chest X-Ray PA view to rule out secondary parenchymal consolidation or pneumothorax.",
    },
    referral: {
      priority: "routine",
      note: "Referral to Pulmonology for comprehensive pulmonary function testing (spirometry) and asthma controller step-up.",
    },
    inventory: {
      quantity: 1,
    },
  },
  {
    id: "allergic-dermatitis",
    name: "Acute Allergic Contact Dermatitis",
    category: "Dermatology",
    triage: {
      systolicBp: 120,
      diastolicBp: 78,
      pulseBpm: 74,
      respiratoryRate: 16,
      temperatureC: 36.6,
      oxygenSaturation: 99,
      weightKg: 67.0,
      heightCm: 170,
      painScore: 2,
      acuity: "routine",
      chiefComplaint: "Intensely itchy red rash and small bumps on both forearms and hands for 4 days.",
      notes: "Discrete erythematous papules over both forearms. No angioedema or mucosal involvement. Vital signs stable.",
    },
    soap: `Subjective:
Patient is a 34-year-old presenting with a 4-day history of intensely pruritic, erythematous papules and plaques over bilateral forearms and dorsal hands. States rash appeared approximately 24 hours after using a new industrial cleaning solvent at work. Denies facial swelling, lip edema, dyspnea, or fever. Has not applied topical remedies prior to consult.

Objective:
Vitals: BP: 120/78 mmHg, HR: 74 bpm, RR: 16 cpm, Temp: 36.6°C, SpO2: 99%.
General: Alert, conscious, actively scratching dorsal forearms. No angioedema.
Dermatologic: Well-demarcated erythematous plaques with discrete microvesicles and fine excoriations localized to bilateral volar forearms and dorsum of hands. No purulent exudate or crusting. Surrounding skin warm but non-tender.
HEENT: No mucosal lesions or conjunctival erythema.
Lymphatics: No axillary or epitrochlear lymphadenopathy.

Assessment:
1. Allergic Contact Dermatitis, acute (ICD-10: L23.9)

Plan:
1. Pharmacotherapy: Hydrocortisone 1% topical cream apply thin layer BID to affected areas for 7 days; Bilastine 20mg PO OD for daytime pruritus.
2. Skin care: Gentle fragrance-free soap, apply ceramide-based barrier moisturizers frequently.
3. Avoidance: Avoid suspected cleaning solvent; wear non-latex nitrile gloves with cotton liners.
4. Warning signs: Seek consult if honey-colored crusting (impetiginization) or spreading erythema develops.
5. Follow-up in 7 days to review skin barrier recovery.`,
    prescription: {
      medication: "Hydrocortisone 1% Topical Cream 15g Tube",
      dosage: "Apply a thin layer to affected skin areas twice daily for 7 days.",
      note: "For external dermatologic use only. Wash hands before and after application.",
    },
    certificate: {
      title: "Medical Certificate - Occupational Contact Dermatitis Rest",
      statement: "This is to certify that the patient was examined and diagnosed with Acute Contact Dermatitis. The patient is advised to avoid contact with chemical irritants for 3 days and is cleared for non-exposure duties.",
    },
    laboratory: {
      priority: "routine",
      note: "Serum Total IgE and Complete Blood Count with Eosinophil count.",
    },
    referral: {
      priority: "routine",
      note: "Referral to Dermatology for diagnostic patch testing and occupational allergen identification.",
    },
    inventory: {
      quantity: 1,
    },
  },
  {
    id: "cap-low-risk",
    name: "Community-Acquired Pneumonia (Low Risk, CURB-65 = 0)",
    category: "Infectious Disease",
    triage: {
      systolicBp: 124,
      diastolicBp: 80,
      pulseBpm: 84,
      respiratoryRate: 18,
      temperatureC: 38.2,
      oxygenSaturation: 96,
      weightKg: 70.0,
      heightCm: 174,
      painScore: 3,
      acuity: "urgent",
      chiefComplaint: "Productive cough with yellowish sputum, persistent fever, and right-sided chest discomfort x 4 days.",
      notes: "Febrile on arrival (38.2°C). Mild diaphoresis. SpO2 96% on room air. Directed to urgent examination room.",
    },
    soap: `Subjective:
Patient is a 42-year-old presenting with 4 days of productive cough with yellowish sputum, subjective fever, and pleuritic right-sided chest discomfort. Reports mild chills and fatigue. Denies hemoptysis, severe shortness of breath, confusion, or inability to tolerate oral fluids. Non-smoker, no known chronic pulmonary comorbidities.

Objective:
Vitals: BP: 124/80 mmHg, HR: 84 bpm, RR: 18 cpm, Temp: 38.2°C, SpO2: 96% on room air.
General: Conscious, alert, oriented x3, mild diaphoresis, no intercostal retractions.
Respiratory: Bronchial breath sounds and inspiratory crackles auscultated over the right lower lung base. Increased tactile fremitus over right infrascapular zone. No wheezing.
CVS: S1/S2 present, regular rhythm, no murmurs.
CURB-65 Score: Confusion (0), Urea normal (0), RR < 30 (0), BP >= 90/60 (0), Age < 65 (0) = Total Score 0 (Low risk outpatient candidate).

Assessment:
1. Community-Acquired Pneumonia, Low Risk (CURB-65 = 0) (ICD-10: J18.9)

Plan:
1. Antibiotic therapy: Amoxicillin-Clavulanate 875/125mg PO BID with meals x 7 days.
2. Symptomatic: Paracetamol 500mg PO q6h PRN for fever > 37.8°C; Carbocisteine 500mg PO TID for mucolysis.
3. Supportive: Chest physiotherapy, incentive spirometry, increase fluid intake (>3L/day).
4. Safety net: Return to ER immediately if severe dyspnea, persistent fever > 48h, cyanosis, or confusion develops.
5. Excused from work duties for 5 days. Follow-up clinic consult in 48-72 hours.`,
    prescription: {
      medication: "Amoxicillin / Clavulanate Potassium 875mg/125mg Tablet",
      dosage: "Take 1 tablet by mouth twice daily with meals for 7 consecutive days.",
      note: "Complete full 7-day course of antibiotics even if symptoms resolve earlier. Take with meals.",
    },
    certificate: {
      title: "Medical Certificate - Medical Leave for Pneumonia",
      statement: "This certifies that the patient was diagnosed with Community-Acquired Pneumonia (mild). The patient is advised 5 calendar days of strict home rest and is excused from work.",
    },
    laboratory: {
      priority: "urgent",
      note: "Chest X-Ray PA/Lateral view and Sputum Gram stain with culture & sensitivity.",
    },
    referral: {
      priority: "routine",
      note: "Referral to Pulmonology / Infectious Disease if fever or infiltrates fail to resolve after 72 hours of antimicrobial therapy.",
    },
    inventory: {
      quantity: 1,
    },
  },
];

export interface GeneratedEncounterData {
  profile: ClinicalTestProfile;
  soap: string;
  prescription: {
    medication: string;
    dosage: string;
    note: string;
  };
  certificate: {
    title: string;
    statement: string;
  };
  laboratory: {
    serviceId: string;
    priority: "routine" | "urgent" | "asap" | "stat";
    note: string;
  };
  referral: {
    specialistRoleId: string;
    priority: "routine" | "urgent" | "asap";
    note: string;
  };
  inventory: {
    departmentId: string;
    stockId: string;
    quantity: string;
  };
}

const STORAGE_KEY = "odc_developer_debug_mode";

export function isDeveloperModeActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setDeveloperModeActive(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.sessionStorage.setItem(STORAGE_KEY, "true");
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore sessionStorage errors in restricted sandboxes
  }
}

let lastProfileIndex = -1;

export function generateRandomEncounterData(options?: {
  laboratoryServices?: LaboratoryServiceSummary[];
  specialists?: SpecialistOption[];
  inventory?: InventoryWorkspace | null;
  currentDepartmentId?: string | null;
}): GeneratedEncounterData {
  // Pick a random profile different from the last one if possible
  let nextIndex = Math.floor(Math.random() * CLINICAL_TEST_PROFILES.length);
  if (CLINICAL_TEST_PROFILES.length > 1 && nextIndex === lastProfileIndex) {
    nextIndex = (nextIndex + 1) % CLINICAL_TEST_PROFILES.length;
  }
  lastProfileIndex = nextIndex;
  const profile = CLINICAL_TEST_PROFILES[nextIndex];

  // Pick matching or random active lab service
  let serviceId = "";
  if (options?.laboratoryServices && options.laboratoryServices.length > 0) {
    const activeLabs = options.laboratoryServices.filter((s) => s.active);
    const pool = activeLabs.length > 0 ? activeLabs : options.laboratoryServices;
    const randomLab = pool[Math.floor(Math.random() * pool.length)];
    if (randomLab) serviceId = randomLab.id;
  }

  // Pick matching or random specialist
  let specialistRoleId = "";
  if (options?.specialists && options.specialists.length > 0) {
    const randomSpecialist =
      options.specialists[Math.floor(Math.random() * options.specialists.length)];
    if (randomSpecialist) specialistRoleId = randomSpecialist.practitionerRoleId;
  }

  // Pick matching or random inventory consumable
  let departmentId = options?.currentDepartmentId || "";
  let stockId = "";
  let quantity = String(profile.inventory.quantity || 1);

  if (options?.inventory && options.inventory.stock.length > 0) {
    const availableStocks = options.inventory.stock.filter(
      (s) => Number(s.quantity) > 0,
    );
    const pool =
      availableStocks.length > 0 ? availableStocks : options.inventory.stock;
    const randomStock = pool[Math.floor(Math.random() * pool.length)];
    if (randomStock) {
      stockId = randomStock.id;
      departmentId = randomStock.department_id;
    }
  }

  return {
    profile,
    soap: profile.soap,
    prescription: {
      medication: profile.prescription.medication,
      dosage: profile.prescription.dosage,
      note: profile.prescription.note,
    },
    certificate: {
      title: profile.certificate.title,
      statement: profile.certificate.statement,
    },
    laboratory: {
      serviceId,
      priority: profile.laboratory.priority,
      note: profile.laboratory.note,
    },
    referral: {
      specialistRoleId,
      priority: profile.referral.priority,
      note: profile.referral.note,
    },
    inventory: {
      departmentId,
      stockId,
      quantity,
    },
  };
}

let lastTriageIndex = -1;

export function generateRandomTriageData(): TriageTestProfile & { profileName: string } {
  let nextIndex = Math.floor(Math.random() * CLINICAL_TEST_PROFILES.length);
  if (CLINICAL_TEST_PROFILES.length > 1 && nextIndex === lastTriageIndex) {
    nextIndex = (nextIndex + 1) % CLINICAL_TEST_PROFILES.length;
  }
  lastTriageIndex = nextIndex;
  const profile = CLINICAL_TEST_PROFILES[nextIndex];
  return {
    ...profile.triage,
    profileName: profile.name,
  };
}
