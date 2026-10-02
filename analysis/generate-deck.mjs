import PptxGenJS from "pptxgenjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotsDir = path.join(__dirname, "screenshots");
const brandDir = path.join(__dirname, "brand");
const outputPptx = path.join(__dirname, "Odyssey_Healthcare_OS_Pitch_Deck.pptx");

// Helper to check if asset exists
function getImgPath(filename) {
  const p = path.join(screenshotsDir, filename);
  return fs.existsSync(p) ? p : null;
}
function getBrandPath(filename) {
  const p = path.join(brandDir, filename);
  return fs.existsSync(p) ? p : null;
}

const brandLogoPath = getBrandPath("odc-logo.png");
const brandBannerPath = getBrandPath("odc-banner.png");

const pptx = new PptxGenJS();
const SHAPES = pptx.shapes;
pptx.layout = "LAYOUT_WIDE"; // Standard 13.333 x 7.5 inches (16:9 widescreen)
pptx.author = "ODC / Odyssey Healthcare OS";
pptx.company = "ODC (Odyssey IT Solutions)";
pptx.title = "ODC Odyssey Healthcare OS - System Showcase & Impact Deck";

// Official ODC Brand Color Palette
const COLORS = {
  odcNavy: "162238",        // Primary Deep Navy
  odcDarkBg: "0E1726",      // Deep Dark Slate Navy Background
  odcOrange: "FF5A1F",      // ODC Vibrant Signature Warm Orange
  odcOrangeDark: "D84315",  // Deep Terracotta Orange
  odcOrangeLight: "FFF1EB", // Soft Peach / Light Orange Tint
  odcOrangeBorder: "FFD8CC",// Soft Orange Border
  bgLight: "F8FAFC",        // Clean Off-White Slate Background
  cardBg: "FFFFFF",         // Pure White Card
  cardDark: "1B273F",       // Dark Card Background
  cardBorder: "E2E8F0",     // Border Slate
  cardBorderDark: "334155", // Dark Border Slate
  accentGreen: "16A34A",    // Positive / NBB Zero Balance Green
  accentGreenBg: "DCFCE7",  // Soft Green Pill Background
  accentBlue: "0284C7",     // Clinical / Telehealth Cyan Blue
  accentBlueBg: "E0F2FE",   // Soft Blue Pill Background
  textDark: "0F172A",       // Primary Header Slate
  textMuted: "475569",      // Secondary Slate Gray
  textLight: "FFFFFF",      // Pure White Text
  textMutedLight: "94A3B8", // Muted Light Gray Text
};

// Helper: Common Content Slide Frame
function createSlide(titleEyebrow, titleMain, bg = COLORS.bgLight) {
  const slide = pptx.addSlide();
  slide.background = { color: bg };

  // Eyebrow with ODC Orange accent
  slide.addText(titleEyebrow.toUpperCase(), {
    x: 0.8,
    y: 0.45,
    w: 10.5,
    h: 0.3,
    fontSize: 10,
    fontFace: "Arial",
    bold: true,
    color: COLORS.odcOrange,
    charSpacing: 2,
  });

  // Main Takeaway Headline
  slide.addText(titleMain, {
    x: 0.8,
    y: 0.75,
    w: 10.5,
    h: 0.65,
    fontSize: 20,
    fontFace: "Arial",
    bold: true,
    color: bg === COLORS.odcDarkBg ? COLORS.textLight : COLORS.textDark,
  });

  // ODC Brand Watermark / Mini Logo in Top Right Header
  if (brandLogoPath && fs.existsSync(brandLogoPath)) {
    slide.addImage({
      path: brandLogoPath,
      x: 11.6,
      y: 0.45,
      w: 0.9,
      h: 0.9,
    });
  }

  // Footer branding
  slide.addText("ODC ODYSSEY HEALTHCARE OS · YOUR COMPANION TOWARDS YOUR DIGITAL JOURNEY · odysseyphitsolutions@gmail.com", {
    x: 0.8,
    y: 7.0,
    w: 11.7,
    h: 0.25,
    fontSize: 8.5,
    fontFace: "Arial",
    color: bg === COLORS.odcDarkBg ? "94A3B8" : "64748B",
  });

  return slide;
}

// ==============================================================================
// SLIDE 1: Title & Vision (Official ODC Branding)
// ==============================================================================
function buildSlide1() {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.odcDarkBg };

  // Background accent glow / decorative shape
  slide.addShape(SHAPES.RECTANGLE, {
    x: 0, y: 0, w: 13.33, h: 0.15,
    fill: { color: COLORS.odcOrange }
  });

  // Embed Real ODC 3D Logo prominently
  if (brandLogoPath && fs.existsSync(brandLogoPath)) {
    slide.addImage({
      path: brandLogoPath,
      x: 0.8,
      y: 1.2,
      w: 2.4,
      h: 2.4,
    });
  }

  // Official Tagline Banner Pill
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 3.5, y: 1.2, w: 5.5, h: 0.4,
    fill: { color: "1E2A44" },
    line: { color: COLORS.odcOrange, width: 1.5 }
  });
  slide.addText("YOUR COMPANION TOWARDS YOUR DIGITAL JOURNEY", {
    x: 3.5, y: 1.2, w: 5.5, h: 0.4,
    fontSize: 10, fontFace: "Arial", bold: true, color: COLORS.odcOrange, align: "center"
  });

  // Main Presentation Title
  slide.addText("ODC Odyssey Healthcare OS", {
    x: 3.5, y: 1.7, w: 9.0, h: 0.9,
    fontSize: 34, fontFace: "Arial", bold: true, color: COLORS.textLight
  });

  // Subtitle: Core Mission for Filipinos & Healthcare Workers
  slide.addText("The Connected Operating System for Philippine Public Healthcare", {
    x: 3.5, y: 2.65, w: 9.0, h: 0.45,
    fontSize: 18, fontFace: "Arial", color: "CBD5E1"
  });

  slide.addText("Empowering Healthcare Workers · Enforcing No Balance Billing (NBB) · Connecting RHUs to Apex Hospitals", {
    x: 3.5, y: 3.15, w: 9.0, h: 0.4,
    fontSize: 13, fontFace: "Arial", bold: true, color: COLORS.odcOrange
  });

  // 3 Feature Showcase Cards across the bottom
  const pillars = [
    {
      title: "Universal Health Care (RA 11223)",
      desc: "Automated PhilHealth No Balance Billing (NBB) ensuring ZERO out-of-pocket charges for indigent and sponsored patients in accredited wards."
    },
    {
      title: "Relief for Frontline Workers",
      desc: "Single-screen tri-service triage (In-Person, Telehealth, Home Care) eliminating 20-minute manual paper charting and clipboard chaos."
    },
    {
      title: "Federated Health Network",
      desc: "HL7 FHIR R4 clinical data architecture connecting municipal Rural Health Units (RHUs) to provincial apex medical centers."
    }
  ];

  pillars.forEach((p, i) => {
    const xPos = 0.8 + i * 3.95;
    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: xPos, y: 4.2, w: 3.75, h: 2.4,
      fill: { color: COLORS.cardDark },
      line: { color: "334155", width: 1 }
    });
    // Top border highlight in ODC Orange
    slide.addShape(SHAPES.RECTANGLE, {
      x: xPos, y: 4.2, w: 3.75, h: 0.08,
      fill: { color: COLORS.odcOrange }
    });
    slide.addText(p.title, {
      x: xPos + 0.25, y: 4.45, w: 3.25, h: 0.4,
      fontSize: 13, fontFace: "Arial", bold: true, color: COLORS.textLight
    });
    slide.addText(p.desc, {
      x: xPos + 0.25, y: 4.95, w: 3.25, h: 1.45,
      fontSize: 10.5, fontFace: "Arial", color: "94A3B8", lineSpacing: 15
    });
  });

  // Footer metadata
  slide.addText("ODC (Odyssey IT Solutions) · Public Healthcare Impact Showcase · Web: odc.ph · Email: odysseyphitsolutions@gmail.com", {
    x: 0.8, y: 7.0, w: 11.7, h: 0.25,
    fontSize: 9, fontFace: "Arial", color: "64748B"
  });

  slide.addNotes(`SPEAKER NOTES:
Welcome hospital executives, provincial health officers, and healthcare leaders.
Today we introduce ODC Odyssey Healthcare OS—a purpose-built operating system designed specifically for the realities of the Philippine public healthcare system.
Our mission is not about software commercialization; it is about patient dignity and healthcare worker relief.
Under Republic Act 11223 (Universal Health Care Act), every Filipino is entitled to comprehensive, compassionate care. Yet millions of Filipinos face crippling out-of-pocket costs and 4-hour queues, while doctors and nurses are burning out under mountains of repetitive paper charting.
Odyssey OS solves these challenges at the root with a connected, FHIR-standardized platform built to serve the Filipino people.`);
}

// ==============================================================================
// SLIDE 2: The Human Reality in Philippine Healthcare (The Challenge)
// ==============================================================================
function buildSlide2() {
  const slide = createSlide(
    "THE HUMAN REALITY IN PHILIPPINE HEALTHCARE",
    "Fragmented Facilities Burden Vulnerable Filipinos and Overwork Frontline Clinicians"
  );

  // Left Column: The Patient Reality
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 5.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.odcOrangeBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 0.8, y: 1.6, w: 5.7, h: 0.08,
    fill: { color: COLORS.odcOrange }
  });
  slide.addText("THE PATIENT STRUGGLE: FINANCIAL SHOCK & EXHAUSTING QUEUES", {
    x: 1.1, y: 1.85, w: 5.1, h: 0.3,
    fontSize: 10, fontFace: "Arial", bold: true, color: COLORS.odcOrangeDark, charSpacing: 1.5
  });

  // Stat Callout: 44.2% Out of pocket
  slide.addText("44.2%", {
    x: 1.1, y: 2.2, w: 5.1, h: 0.8,
    fontSize: 40, fontFace: "Arial", bold: true, color: COLORS.odcOrange
  });
  slide.addText("Out-of-Pocket Expenditure (PSA PNHA 2024: ₱615.6B)", {
    x: 1.1, y: 2.95, w: 5.1, h: 0.3,
    fontSize: 12, fontFace: "Arial", bold: true, color: COLORS.textDark
  });
  slide.addText("Despite PhilHealth coverage, 44.2% of all health spending in the Philippines is paid directly out-of-pocket by patients—forcing poor families to borrow money, pawn possessions, or delay critical treatments.", {
    x: 1.1, y: 3.3, w: 5.1, h: 0.9,
    fontSize: 10.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 15
  });

  // Stat Callout: 2 to 4 hour queue
  slide.addText("2 to 4 Hours in Line", {
    x: 1.1, y: 4.3, w: 5.1, h: 0.45,
    fontSize: 18, fontFace: "Arial", bold: true, color: "B45309"
  });
  slide.addText("Patients travel hours from rural barangays only to wait on wooden benches in overcrowded hospital corridors just to secure an outpatient consultation slip.", {
    x: 1.1, y: 4.8, w: 5.1, h: 0.8,
    fontSize: 10.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 15
  });
  slide.addText("• Redundant Diagnostic Tests: Paper slips get lost, forcing repeated blood chemistries and X-rays at every referral step.\n• Unexpected Out-of-Pocket Bills: Lack of automated NBB checking leads to surprise hospital bills for vulnerable patients.", {
    x: 1.1, y: 5.65, w: 5.1, h: 0.9,
    fontSize: 10, fontFace: "Arial", color: "78350F", lineSpacing: 14
  });

  // Right Column: The Healthcare Worker Reality
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 6.8, y: 1.6, w: 5.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 6.8, y: 1.6, w: 5.7, h: 0.08,
    fill: { color: COLORS.odcNavy }
  });
  slide.addText("THE CLINICIAN STRUGGLE: SEVERE BURNOUT & PAPERWORK", {
    x: 7.1, y: 1.85, w: 5.1, h: 0.3,
    fontSize: 10, fontFace: "Arial", bold: true, color: COLORS.odcNavy, charSpacing: 1.5
  });

  const workerPains = [
    {
      title: "30%+ of Shifts Lost to Manual Paperwork",
      desc: "Nurses and resident physicians spend hours handwriting patient charts, logbooks, and PhilHealth forms instead of providing bedside care."
    },
    {
      title: "Tri-Service Disconnection",
      desc: "Doctors must juggle physical clinic walk-ins, teleconsultation phone calls, and home visits across disconnected logbooks and spreadsheets."
    },
    {
      title: "Frequent Public Pharmacy Stockouts",
      desc: "Without real-time inventory tracking, clinicians prescribe life-saving medicines only for patients to find the public pharmacy empty, forcing outside commercial purchases."
    },
    {
      title: "Medicolegal and Privacy Vulnerabilities",
      desc: "Paper records leave staff vulnerable to missing documentation, misplaced consent forms, and audit discrepancies under RA 10173 (Data Privacy Act)."
    }
  ];

  workerPains.forEach((p, i) => {
    const yP = 2.3 + i * 1.05;
    slide.addText(p.title, {
      x: 7.1, y: yP, w: 5.1, h: 0.3,
      fontSize: 12, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 7.1, y: yP + 0.3, w: 5.1, h: 0.65,
      fontSize: 10, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 14
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Let's ground our discussion in the human reality of Philippine healthcare.
Official 2024 Philippine Statistics Authority data reveals that 44.2% of health expenditure—₱615.6 billion—is paid directly out of the pockets of ordinary citizens.
When a father from an island barangay falls ill, his family often borrows from informal lenders at high interest rates just to afford hospitalization. Even when qualifying for PhilHealth No Balance Billing, families are handed lists of supplies to buy outside because the hospital pharmacy ran out.
Meanwhile, our doctors and nurses are exhausted. In crowded provincial hospitals, resident physicians see 60 to 80 patients a day while handwriting redundant paper charts.
Odyssey OS was created to resolve both sides of this crisis: protecting patients financially while liberating healthcare workers from administrative burnout.`);
}

// ==============================================================================
// SLIDE 3: Mission & Vision: Built for Filipinos & Healthcare Workers
// ==============================================================================
function buildSlide3() {
  const slide = createSlide(
    "MISSION & VALUES",
    "Technology Designed to Deliver Equity to Patients and Relief to Frontline Staff"
  );

  const pillars = [
    {
      tag: "PILLAR 1: FOR THE FILIPINO PATIENT",
      title: "Dignified, Zero-Cost Healthcare",
      accent: COLORS.odcOrange,
      bg: COLORS.odcOrangeLight,
      border: COLORS.odcOrangeBorder,
      bullets: [
        "Automated No Balance Billing (NBB): Indigent and sponsored Filipinos are guaranteed ₱0.00 out-of-pocket expenses for covered hospital care.",
        "Mobile & Barangay Self-Booking: Patients secure clinic slots from home or rural health units, eliminating humiliating 4-hour queues.",
        "Zero Repeated Tests: Prior blood chemistries, X-rays, and allergy records are instantly accessible, saving patients money and discomfort.",
        "Continuity of Care: A single digital medical history that follows the patient across clinics, district hospitals, and provincial apex centers."
      ]
    },
    {
      tag: "PILLAR 2: FOR HEALTHCARE WORKERS",
      title: "Liberation from Paper Burnout",
      accent: COLORS.accentBlue,
      bg: COLORS.accentBlueBg,
      border: "BAE6FD",
      bullets: [
        "Single-Screen Tri-Service Triage: In-person walk-ins, telehealth, and community home visits consolidated into one live queue.",
        "< 3-Minute Digital Charting: Pre-structured clinical forms, ICD-10 suggestions, and quick vitals recording cut paperwork time by 80%.",
        "Clinical Scope & Legal Protection: Granular 34-permission RBAC ensures electronic signatures and doctor authorizations are legally shielded.",
        "Real-Time Floor Visibility: Nursing supervisors monitor wait times and triage priority before emergency departments become overcrowded."
      ]
    },
    {
      tag: "PILLAR 3: FOR PUBLIC INSTITUTIONS",
      title: "Accountable Public Health",
      accent: COLORS.accentGreen,
      bg: COLORS.accentGreenBg,
      border: "BBF7D0",
      bullets: [
        "Guaranteed Medicine Availability: Real-time inventory tracking prevents stockouts of vital antihypertensives, antibiotics, and vaccines.",
        "Inter-Facility Referral Network: Seamless digital handoffs from rural health units (RHUs) to provincial hospitals without paper slips.",
        "Universal Health Care (RA 11223) Compliance: Built-in support for PhilHealth Konsulta capitation packages and provincial health integration.",
        "Data Sovereignty & Privacy (RA 10173): Sovereign encrypted cloud with Row-Level Security safeguarding sensitive patient health data."
      ]
    }
  ];

  pillars.forEach((p, i) => {
    const xPos = 0.8 + i * 3.95;
    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: xPos, y: 1.6, w: 3.75, h: 5.1,
      fill: { color: COLORS.cardBg },
      line: { color: p.border, width: 1.5 }
    });
    // Top colored banner
    slide.addShape(SHAPES.RECTANGLE, {
      x: xPos, y: 1.6, w: 3.75, h: 0.1,
      fill: { color: p.accent }
    });
    // Tag pill
    slide.addText(p.tag, {
      x: xPos + 0.2, y: 1.85, w: 3.35, h: 0.3,
      fontSize: 9, fontFace: "Arial", bold: true, color: p.accent, charSpacing: 1
    });
    // Title
    slide.addText(p.title, {
      x: xPos + 0.2, y: 2.15, w: 3.35, h: 0.45,
      fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
    });

    // Bullets
    p.bullets.forEach((b, j) => {
      slide.addShape(SHAPES.OVAL, {
        x: xPos + 0.2, y: 2.85 + j * 1.0, w: 0.1, h: 0.1,
        fill: { color: p.accent }
      });
      slide.addText(b, {
        x: xPos + 0.4, y: 2.75 + j * 1.0, w: 3.15, h: 0.9,
        fontSize: 10, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 14
      });
    });
  });

  slide.addNotes(`SPEAKER NOTES:
At ODC Odyssey, our guiding star is simple: technology must serve the people.
We structure our entire platform around three pillars:
First, dignity for Filipino patients. Under RA 11223, indigent patients must never be charged for covered hospital care. Odyssey automates No Balance Billing so that eligible patients automatically receive ₱0.00 bills.
Second, relief for our healthcare heroes. Doctors and nurses did not spend a decade in medical school to fill out carbon-copy logbooks. Odyssey provides a single-screen tri-service queue that cuts documentation time from 20 minutes to under 3 minutes.
Third, accountability for public health institutions. By connecting municipal health units to provincial hospitals and maintaining real-time pharmacy stock monitoring, Odyssey prevents the medicine stockouts that hurt poor patients most.`);
}

// ==============================================================================
// SLIDE 4: System Architecture Built for Public Health Resilience
// ==============================================================================
function buildSlide4() {
  const slide = createSlide(
    "SYSTEM ARCHITECTURE & STANDARDS",
    "A Modern, Open Standards Core Built for Philippine Public Health Networks"
  );

  const archPillars = [
    {
      title: "1. Federated Multi-Facility Isolation",
      tag: "DATABASE RLS & PROVINCIAL NETWORK",
      desc: "Granular PostgreSQL Row-Level Security partitioned by organization_id and facility_id. Enables a single province to host hundreds of RHUs and district hospitals on a shared cloud while maintaining complete statutory data segregation."
    },
    {
      title: "2. FHIR-Aligned Clinical Data Core",
      tag: "HL7 FHIR R4 INTERNATIONAL STANDARD",
      desc: "Built natively on standard FHIR clinical resource models (Encounter, Patient, Practitioner, DiagnosticReport, MedicationRequest). Ensures public health facilities can interchange records seamlessly without proprietary vendor lock-in."
    },
    {
      title: "3. Real-Time Operational Dispatch",
      tag: "SUPABASE REALTIME WEBSOCKETS",
      desc: "Instant bi-directional state synchronization. When a patient arrives at triage or is called by a physician, queue boards, nursing stations, and patient mobile views update in under 100 milliseconds without page refreshes."
    },
    {
      title: "4. Granular 34-Permission RBAC",
      tag: "MEDICOLEGAL & CLINICAL SAFETY",
      desc: "34 discrete permissions governing clinical notes, prescription signing, pharmacy dispensing, and financial ledger adjustments. Guarantees that every medical action is securely audited under Republic Act 10173 (DPA)."
    }
  ];

  archPillars.forEach((p, i) => {
    const xPos = 0.8 + (i % 2) * 5.95;
    const yPos = 1.6 + Math.floor(i / 2) * 2.5;

    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: xPos, y: yPos, w: 5.7, h: 2.3,
      fill: { color: COLORS.cardBg },
      line: { color: COLORS.cardBorder, width: 1.5 }
    });
    // Left decorative bar
    slide.addShape(SHAPES.RECTANGLE, {
      x: xPos, y: yPos, w: 0.08, h: 2.3,
      fill: { color: i === 0 ? COLORS.odcOrange : (i === 1 ? COLORS.accentBlue : (i === 2 ? COLORS.accentGreen : COLORS.odcNavy)) }
    });
    slide.addText(p.tag, {
      x: xPos + 0.3, y: yPos + 0.2, w: 5.1, h: 0.25,
      fontSize: 9, fontFace: "Arial", bold: true, color: COLORS.odcOrange, charSpacing: 1.5
    });
    slide.addText(p.title, {
      x: xPos + 0.3, y: yPos + 0.5, w: 5.1, h: 0.35,
      fontSize: 14, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: xPos + 0.3, y: yPos + 0.9, w: 5.1, h: 1.25,
      fontSize: 10.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 15
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Let's examine how Odyssey OS is engineered under the hood.
Unlike legacy hospital systems that run on isolated Windows XP desktop servers in hospital basements, Odyssey is built on a modern, cloud-native architecture.
First, we use PostgreSQL Row-Level Security to isolate tenant data. A provincial government can deploy Odyssey across 20 municipalities, giving every Rural Health Unit its own secure partition while allowing clinical record sharing when a patient is referred.
Second, our clinical data model is aligned with HL7 FHIR R4. This means Odyssey speaks the universal healthcare language recognized by the DOH and PhilHealth.
Third, Supabase Realtime WebSockets power live queue dispatch. When a doctor clicks 'Call Patient', the waiting room monitor and patient phone update instantly.
Fourth, our 34-permission RBAC ensures legal compliance and clinical role clarity.`);
}

// ==============================================================================
// SLIDE 5: Clinical Front-Door — Patient Booking & Transparency
// ==============================================================================
function buildSlide5() {
  const slide = createSlide(
    "PATIENT ACCESS & DIGNITY",
    "Eliminating 4-Hour Queues with Dignified, Transparent Digital Scheduling"
  );

  const imgPath = getImgPath("patient-booking.png");

  // Left Column: Real System Screenshot
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 6.8, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.odcOrangeBorder, width: 1.5 }
  });
  if (imgPath) {
    slide.addImage({
      path: imgPath,
      x: 0.9, y: 1.7, w: 6.6, h: 4.9
    });
  }

  // Right Column: Feature Explanations & Impact
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 0.08,
    fill: { color: COLORS.odcOrange }
  });

  slide.addText("LIVE SYSTEM CAPABILITIES", {
    x: 8.1, y: 1.85, w: 4.1, h: 0.25,
    fontSize: 9.5, fontFace: "Arial", bold: true, color: COLORS.odcOrange, charSpacing: 1.5
  });
  slide.addText("Dignified Scheduling for Every Filipino", {
    x: 8.1, y: 2.15, w: 4.1, h: 0.45,
    fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
  });

  const points = [
    {
      title: "Multi-Doctor & Facility Selection",
      desc: "Patients choose their assigned physician, department, and available consultation date from home or through local Barangay Health Stations."
    },
    {
      title: "Tri-Service Consultation Options",
      desc: "Clearly choose between In-Person Hospital Visits, Teleconsultation for remote islands, or Home Health for bedridden elders."
    },
    {
      title: "Complete Fee & NBB Transparency",
      desc: "Total transparency before arrival. For indigent patients under NBB, total consultation fee displays as ₱0.00, eliminating fear of surprise hospital costs."
    },
    {
      title: "Live Queue Notification",
      desc: "Patients receive real-time queue numbers, allowing them to arrive near their appointment time rather than sitting for 4 hours in crowded hallways."
    }
  ];

  points.forEach((p, i) => {
    const yP = 2.7 + i * 1.0;
    slide.addText(p.title, {
      x: 8.1, y: yP, w: 4.1, h: 0.25,
      fontSize: 11, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 8.1, y: yP + 0.25, w: 4.1, h: 0.65,
      fontSize: 9.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 13
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Here on Slide 5 is a real screenshot from Odyssey's live Patient Web portal.
Notice how clean and intuitive the booking experience is.
In the traditional public hospital setup, patients must wake up at 4:00 AM, travel to the hospital, and stand in long physical lines just to receive a paper number stub.
With Odyssey, patients or rural health workers can book consultations digitally. They select the doctor, choose the consultation mode—in-person, telehealth, or home visit—and see their schedule clearly.
Most importantly, for patients covered under PhilHealth No Balance Billing, the system displays ₱0.00 total fee upfront. This removes the widespread psychological fear among poor Filipinos that stepping into a hospital will plunge their family into debt.`);
}

// ==============================================================================
// SLIDE 6: Empowering Doctors — Unified Clinical Schedules & Practice Control
// ==============================================================================
function buildSlide6() {
  const slide = createSlide(
    "HEALTHCARE WORKER EMPOWERMENT",
    "Giving Clinicians Clear Schedules and Seamless Multi-Service Control"
  );

  const imgPath = getImgPath("doctor-fees.png");

  // Left Column: Real System Screenshot
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 6.8, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  if (imgPath) {
    slide.addImage({
      path: imgPath,
      x: 0.9, y: 1.7, w: 6.6, h: 4.9
    });
  }

  // Right Column: Feature Explanations & Impact
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 0.08,
    fill: { color: COLORS.accentBlue }
  });

  slide.addText("CLINICIAN AUTONOMY", {
    x: 8.1, y: 1.85, w: 4.1, h: 0.25,
    fontSize: 9.5, fontFace: "Arial", bold: true, color: COLORS.accentBlue, charSpacing: 1.5
  });
  slide.addText("Structuring Institutional Clinical Hours", {
    x: 8.1, y: 2.15, w: 4.1, h: 0.45,
    fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
  });

  const points = [
    {
      title: "Multi-Tiered Service Schedules",
      desc: "Doctors configure dedicated consultation slots for initial triage, complex follow-ups, and emergency referrals without manual coordination."
    },
    {
      title: "Seamless Hospital & Ward Coordination",
      desc: "Allows doctors to balance outpatient clinic hours against inpatient ward rounds and surgical operating room schedules."
    },
    {
      title: "Standardized Public Health Consultation Types",
      desc: "Direct integration with public health classification codes, ensuring patient encounters align with PhilHealth Konsulta and DOH guidelines."
    },
    {
      title: "Eliminating Administrative Intermediaries",
      desc: "Physicians manage their own practice calendar and service tiers directly, eliminating scheduling errors and miscommunication between departments."
    }
  ];

  points.forEach((p, i) => {
    const yP = 2.7 + i * 1.0;
    slide.addText(p.title, {
      x: 8.1, y: yP, w: 4.1, h: 0.25,
      fontSize: 11, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 8.1, y: yP + 0.25, w: 4.1, h: 0.65,
      fontSize: 9.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 13
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 6 displays the physician management workspace in the Provider portal.
Healthcare workers need autonomy and structure to deliver their best care.
In many provincial hospitals, outpatient clinics operate without structured appointment tiers. Resident physicians are overwhelmed when dozens of patients arrive simultaneously for quick medication refills while complex diagnostic cases wait in the same queue.
Odyssey enables physicians and departmental chiefs to configure distinct service tiers—separating quick follow-ups, primary consultations, and specialized evaluations.
This allows doctors to balance their clinical outpatient hours with hospital ward rounds and surgical duties seamlessly.`);
}

// ==============================================================================
// SLIDE 7: Alleviating Clinician Burnout — Single Unified Queue for Tri-Service Care
// ==============================================================================
function buildSlide7() {
  const slide = createSlide(
    "CLINICAL WORKFLOW AUTOMATION",
    "Single-Screen Tri-Service Queue: Ending Paper Chaos and Clinician Burnout"
  );

  const imgPath = getImgPath("doctor-queue.png");

  // Left Column: Real System Screenshot
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 6.8, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  if (imgPath) {
    slide.addImage({
      path: imgPath,
      x: 0.9, y: 1.7, w: 6.6, h: 4.9
    });
  }

  // Right Column: Feature Explanations & Impact
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 0.08,
    fill: { color: COLORS.odcOrange }
  });

  slide.addText("REDUCING DOCUMENTATION BURDEN", {
    x: 8.1, y: 1.85, w: 4.1, h: 0.25,
    fontSize: 9.5, fontFace: "Arial", bold: true, color: COLORS.odcOrange, charSpacing: 1.5
  });
  slide.addText("One Screen for All Patient Care", {
    x: 8.1, y: 2.15, w: 4.1, h: 0.45,
    fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
  });

  const points = [
    {
      title: "Tri-Service Queue Tabs",
      desc: "Seamlessly toggle between In-Person hospital consultations, Telehealth video visits, and Community Home Care visits from a single unified view."
    },
    {
      title: "Single-Click Patient Status Transitions",
      desc: "Doctors transition patients across Arrived → In Consultation → Completed with one click, automatically updating waiting room monitors."
    },
    {
      title: "Integrated Barrio Health Worker (BHW) Sync",
      desc: "When midwives or BHWs log home health visits in rural barangays, high-risk cases automatically surface directly in the doctor's queue."
    },
    {
      title: "Paper Chart Elimination",
      desc: "Clinicians access past medical records, allergy alerts, and diagnostic lab reports with zero physical chart hunting or clipboard confusion."
    }
  ];

  points.forEach((p, i) => {
    const yP = 2.7 + i * 1.0;
    slide.addText(p.title, {
      x: 8.1, y: yP, w: 4.1, h: 0.25,
      fontSize: 11, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 8.1, y: yP + 0.25, w: 4.1, h: 0.65,
      fontSize: 9.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 13
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 7 shows the heart of the physician's daily experience: the live Doctor Queue in Provider Web.
Every day in Philippine district hospitals, doctors lose 15 to 20 minutes per patient simply finding paper charts, checking who has arrived outside, and deciphering handwritten nurse notes.
Odyssey consolidates all care into this single dashboard.
Notice the tabs at the top: In-Person, Telehealth, and Home Health. A doctor can conduct an in-person clinic, switch to review a teleconsultation from a remote island clinic, and coordinate home care visits logged by community midwives—all in one place.
Clicking 'Start Consultation' opens the pre-populated electronic record immediately. It cuts charting time down to under 3 minutes, giving physicians back hours to care for patients.`);
}

// ==============================================================================
// SLIDE 8: Protecting Vulnerable Filipinos — PhilHealth No Balance Billing (NBB)
// ==============================================================================
function buildSlide8() {
  const slide = createSlide(
    "UNIVERSAL HEALTH CARE & EQUITY",
    "Automated No Balance Billing: Guaranteeing Zero Out-of-Pocket Hospital Bills"
  );

  const imgPath = getImgPath("admin-billing.png");

  // Left Column: Real System Screenshot
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 6.8, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: "BBF7D0", width: 1.5 }
  });
  if (imgPath) {
    slide.addImage({
      path: imgPath,
      x: 0.9, y: 1.7, w: 6.6, h: 4.9
    });
  }

  // Right Column: Feature Explanations & Impact
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 0.08,
    fill: { color: COLORS.accentGreen }
  });

  slide.addText("PROTECTING FILIPINO FAMILIES", {
    x: 8.1, y: 1.85, w: 4.1, h: 0.25,
    fontSize: 9.5, fontFace: "Arial", bold: true, color: COLORS.accentGreen, charSpacing: 1.5
  });
  slide.addText("Automated NBB Verification & Ledger", {
    x: 8.1, y: 2.15, w: 4.1, h: 0.45,
    fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
  });

  const points = [
    {
      title: "Automated NBB Eligibility Flag",
      desc: "Indigent, Sponsored, Senior Citizen, PWD, and 4Ps members are automatically tagged with 'NBB Eligible', locking the patient balance to ₱0.00."
    },
    {
      title: "Eliminating Surprise Out-of-Pocket Costs",
      desc: "All hospital room, diagnostic, and doctor services are absorbed against PhilHealth case rates, preventing billing clerks from issuing illegal co-payments."
    },
    {
      title: "Itemized Hospital Expense Ledger",
      desc: "Tracks exact pharmaceutical, laboratory, and operational costs against case rate subsidies for complete municipal and provincial audit compliance."
    },
    {
      title: "Statutory Republic Act 11223 Compliance",
      desc: "Fulfills the legal mandate of Universal Health Care, protecting hospital leadership from compliance audits while safeguarding poor patients."
    }
  ];

  points.forEach((p, i) => {
    const yP = 2.7 + i * 1.0;
    slide.addText(p.title, {
      x: 8.1, y: yP, w: 4.1, h: 0.25,
      fontSize: 11, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 8.1, y: yP + 0.25, w: 4.1, h: 0.65,
      fontSize: 9.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 13
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 8 represents one of Odyssey's most profound societal contributions: automated PhilHealth No Balance Billing (NBB) enforcement.
In the Philippines, Republic Act 11223 explicitly states that indigent and sponsored patients admitted to public hospital wards must not pay a single centavo out of pocket.
Yet in practice, paper billing systems and fragmented ledgers frequently lead to patients receiving surprise bills for laboratory supplies or medication co-pays.
Look at our live billing workspace on the left.
Odyssey tracks the 'NBB Eligible' flag directly on the invoice record. When an eligible patient receives care, the patient balance is automatically locked to ₱0.00.
The system itemizes the entire hospital cost against the PhilHealth case rate allocation. This guarantees that poor Filipino families leave the hospital without debt, while the hospital accounting office maintains a spotless audit trail.`);
}

// ==============================================================================
// SLIDE 9: Supply Chain Integrity — Preventing Medicine Stockouts in Public Facilities
// ==============================================================================
function buildSlide9() {
  const slide = createSlide(
    "MEDICINE SECURITY & PUBLIC PHARMACY",
    "Multi-Department Inventory: Ensuring Vital Medicines are Always in Stock"
  );

  const imgPath = getImgPath("admin-inventory.png");

  // Left Column: Real System Screenshot
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 6.8, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  if (imgPath) {
    slide.addImage({
      path: imgPath,
      x: 0.9, y: 1.7, w: 6.6, h: 4.9
    });
  }

  // Right Column: Feature Explanations & Impact
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 0.08,
    fill: { color: COLORS.odcOrange }
  });

  slide.addText("PUBLIC PHARMACY MANAGEMENT", {
    x: 8.1, y: 1.85, w: 4.1, h: 0.25,
    fontSize: 9.5, fontFace: "Arial", bold: true, color: COLORS.odcOrange, charSpacing: 1.5
  });
  slide.addText("Zero Stockouts for Critical Medicines", {
    x: 8.1, y: 2.15, w: 4.1, h: 0.45,
    fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
  });

  const points = [
    {
      title: "Hierarchical Central Supply & Pharmacy Tree",
      desc: "Live visibility across Central Warehouse, Outpatient Pharmacy, Inpatient Dispensary, and Emergency Crash Carts."
    },
    {
      title: "Automated Low-Stock Threshold Alerts",
      desc: "When vital antibiotics, antihypertensives, or IV fluids reach safety buffer levels, automated alerts notify provincial procurement officers."
    },
    {
      title: "Batch, Lot & Expiration Date Tracking",
      desc: "Prevents drug spoilage and wastage through first-expiry, first-out (FEFO) dispensing algorithms tailored for tropical storage conditions."
    },
    {
      title: "Protecting NBB Care at the Pharmacy Counter",
      desc: "Ensures public hospital pharmacies never force poor patients to buy essential medicines out-of-pocket from private commercial pharmacies."
    }
  ];

  points.forEach((p, i) => {
    const yP = 2.7 + i * 1.0;
    slide.addText(p.title, {
      x: 8.1, y: yP, w: 4.1, h: 0.25,
      fontSize: 11, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 8.1, y: yP + 0.25, w: 4.1, h: 0.65,
      fontSize: 9.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 13
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 9 showcases Odyssey's Central Supply and Pharmacy Inventory module.
Ask any hospital director in the Philippines what breaks No Balance Billing most often, and they will tell you: pharmacy stockouts.
When the hospital pharmacy runs out of basic IV cannulas or ceftriaxone, nurses are forced to write a prescription slip telling the patient's family to walk across the street and buy it from a private commercial pharmacy. That destroys NBB and forces poor families into out-of-pocket spending.
On the left, you see Odyssey's real multi-department inventory hierarchy.
The system tracks medicine stock levels in real time across the Central Supply, Outpatient Pharmacy, and ER crash carts.
With automated depletion tracking and sparkline trend curves, the pharmacy supervisor sees stock depletion weeks in advance, triggering provincial replenishment orders before a stockout ever occurs.`);
}

// ==============================================================================
// SLIDE 10: Institutional Safety & Data Governance — 34-Permission RBAC
// ==============================================================================
function buildSlide10() {
  const slide = createSlide(
    "DATA PRIVACY & CLINICAL SAFETY",
    "34-Permission RBAC: Protecting Patient Privacy and Shielding Healthcare Workers"
  );

  const imgPath = getImgPath("admin-roles.png");

  // Left Column: Real System Screenshot
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 6.8, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  if (imgPath) {
    slide.addImage({
      path: imgPath,
      x: 0.9, y: 1.7, w: 6.6, h: 4.9
    });
  }

  // Right Column: Feature Explanations & Impact
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 0.08,
    fill: { color: COLORS.odcNavy }
  });

  slide.addText("LEGAL & SCOPE OF PRACTICE PROTECTION", {
    x: 8.1, y: 1.85, w: 4.1, h: 0.25,
    fontSize: 9.5, fontFace: "Arial", bold: true, color: COLORS.odcNavy, charSpacing: 1.5
  });
  slide.addText("Granular Institutional Governance", {
    x: 8.1, y: 2.15, w: 4.1, h: 0.45,
    fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
  });

  const points = [
    {
      title: "34 Discrete System Permissions",
      desc: "Granular controls governing patient charts, clinical triage, prescription signing, pharmacy dispensing, and financial billing adjustments."
    },
    {
      title: "Exact Role Boundaries (Doctor, Nurse, Pharmacist)",
      desc: "Each healthcare worker sees only the clinical tools within their legal scope of practice, eliminating accidental errors or unauthorized data exposure."
    },
    {
      title: "Republic Act 10173 (Data Privacy Act) Compliance",
      desc: "Enforces strict statutory protections for sensitive personal information (SPI) through Row-Level Security and user role isolation."
    },
    {
      title: "Immutable Electronic Audit Trails",
      desc: "Every medical record view, vitals edit, and prescription signature is timestamped in audit_logs, shielding clinicians from medicolegal disputes."
    }
  ];

  points.forEach((p, i) => {
    const yP = 2.7 + i * 1.0;
    slide.addText(p.title, {
      x: 8.1, y: yP, w: 4.1, h: 0.25,
      fontSize: 11, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 8.1, y: yP + 0.25, w: 4.1, h: 0.65,
      fontSize: 9.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 13
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 10 highlights our Role-Based Access Control and data governance matrix.
In healthcare, cybersecurity and data privacy are not just IT concerns—they are patient safety and clinical protection issues.
Under the Philippine Data Privacy Act of 2012 (RA 10173), healthcare institutions handle Sensitive Personal Information that carries strict legal liabilities.
On the left is Odyssey's live Roles CMS.
We have engineered 34 distinct permissions across the platform.
Doctors have prescription authorization; nurses have vitals and triage intake rights; pharmacists have dispensing clearance; billing clerks manage ledgers.
Every action writes an immutable entry into our database audit logs. This protects hospital leadership from regulatory penalties and legally protects our healthcare workers by verifying their electronic signatures.`);
}

// ==============================================================================
// SLIDE 11: Realtime Hospital Orchestration — Live Triage & Operational Visibility
// ==============================================================================
function buildSlide11() {
  const slide = createSlide(
    "OPERATIONAL EXCELLENCE",
    "Executive Facility Dashboard: Ending Bottlenecks Before Overcrowding Occurs"
  );

  const imgPath = getImgPath("admin-dashboard.png");

  // Left Column: Real System Screenshot
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 6.8, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  if (imgPath) {
    slide.addImage({
      path: imgPath,
      x: 0.9, y: 1.7, w: 6.6, h: 4.9
    });
  }

  // Right Column: Feature Explanations & Impact
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 5.1,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.cardBorder, width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 7.8, y: 1.6, w: 4.7, h: 0.08,
    fill: { color: COLORS.odcOrange }
  });

  slide.addText("LIVE FLOOR ORCHESTRATION", {
    x: 8.1, y: 1.85, w: 4.1, h: 0.25,
    fontSize: 9.5, fontFace: "Arial", bold: true, color: COLORS.odcOrange, charSpacing: 1.5
  });
  slide.addText("Real-Time Triage & Outpatient Flow", {
    x: 8.1, y: 2.15, w: 4.1, h: 0.45,
    fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
  });

  const points = [
    {
      title: "Real-Time Facility Metrics",
      desc: "Chief of Clinics and Nursing Supervisors view live counts of total appointments, patients awaiting triage, and completed encounters."
    },
    {
      title: "Proactive Bottleneck Prevention",
      desc: "Spot department surges instantly. When an outpatient clinic exceeds 20 waiting patients, administrators reassign triage nurses before lines spill into hallways."
    },
    {
      title: "Sub-100ms WebSocket Synchronization",
      desc: "Powered by Supabase Realtime; triage priority updates and patient call notifications synchronize instantly across all clinic monitors."
    },
    {
      title: "Evidence-Based Public Health Reporting",
      desc: "Aggregates encounter volumes, disease presentations, and municipal triage data for rapid local government health reporting."
    }
  ];

  points.forEach((p, i) => {
    const yP = 2.7 + i * 1.0;
    slide.addText(p.title, {
      x: 8.1, y: yP, w: 4.1, h: 0.25,
      fontSize: 11, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 8.1, y: yP + 0.25, w: 4.1, h: 0.65,
      fontSize: 9.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 13
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 11 shows the executive operational command center in Admin Web.
For Hospital Directors, Chief Medical Officers, and Supervising Nurses, managing floor chaos during peak morning triage is an enormous challenge.
Traditionally, administrators had no idea which clinic was overwhelmed until hallways were already filled with angry, exhausted patients.
Odyssey's dashboard changes everything.
Because every encounter updates via WebSockets in real time, administrators see exact counts of registered patients, those awaiting vital signs in triage, and those currently in consultation.
If Pediatrics has 30 patients waiting while Internal Medicine is clear, supervisors can immediately deploy a relief nurse to expedite vitals and triage.`);
}

// ==============================================================================
// SLIDE 12: Codebase Feature Maturity Audit (Evidence-Based)
// ==============================================================================
function buildSlide12() {
  const slide = createSlide(
    "CODE AUDIT & CAPABILITY INVENTORY",
    "Evidence-Based Feature Maturity: Shipped Capabilities Ready for Deployment"
  );

  const columns = [
    {
      title: "✅ SHIPPED & WORKING",
      subtitle: "Verified in live codebase & running app",
      color: COLORS.accentGreen,
      bg: COLORS.accentGreenBg,
      items: [
        "Patient Self-Booking (Doctor, service & date selection)",
        "Provider Live Queue (Tri-service filters: In-Person/Tele/Home)",
        "Doctor Practice Schedule CMS (Consultation types)",
        "PhilHealth No Balance Billing (NBB flag & zero-balance billing)",
        "Central Pharmacy Inventory (Tree hierarchy, batch & expiry)",
        "Granular RBAC CMS (34 permissions across 5 roles)",
        "Real-Time Operational Triage Dashboard",
        "Multi-Tenant Partitioning (Postgres Row-Level Security)"
      ]
    },
    {
      title: "🟡 PARTIAL / INTEGRATION-READY",
      subtitle: "Database schema & endpoints active",
      color: "D97706",
      bg: "FEF3C7",
      items: [
        "HL7 FHIR Clinical Resource Mapping (Schema ready)",
        "PhilHealth Case Rate Calculation Engine (Table structures live)",
        "Teleconsultation WebRTC Video Room (Endpoint active)",
        "Diagnostic Lab Result Attachment Pipeline (Partial UI)",
        "Staff CSV Bulk Import for Rapid Facility Onboarding",
        "Multi-Facility Patient Referral Handshake Workflow"
      ]
    },
    {
      title: "🔵 STRATEGIC ROADMAP",
      subtitle: "Planned extensions for island health networks",
      color: COLORS.accentBlue,
      bg: COLORS.accentBlueBg,
      items: [
        "Direct PhilHealth eClaims Web Service Bridge",
        "Offline-First SQLite PWA for GIDA & Island RHUs",
        "DOH Unified Health Information System (UHIS) Exporter",
        "Barangay Health Worker (BHW) Mobile Triage App",
        "PhilHealth Konsulta Capitation Package Auto-Claimer"
      ]
    }
  ];

  columns.forEach((col, i) => {
    const xPos = 0.8 + i * 3.95;
    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: xPos, y: 1.6, w: 3.75, h: 5.1,
      fill: { color: COLORS.cardBg },
      line: { color: COLORS.cardBorder, width: 1.5 }
    });
    // Header banner
    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: xPos + 0.15, y: 1.75, w: 3.45, h: 0.65,
      fill: { color: col.bg }
    });
    slide.addText(col.title, {
      x: xPos + 0.25, y: 1.82, w: 3.25, h: 0.3,
      fontSize: 11, fontFace: "Arial", bold: true, color: col.color
    });
    slide.addText(col.subtitle, {
      x: xPos + 0.25, y: 2.12, w: 3.25, h: 0.22,
      fontSize: 8.5, fontFace: "Arial", color: COLORS.textMuted
    });

    // Item List
    col.items.forEach((item, j) => {
      slide.addShape(SHAPES.OVAL, {
        x: xPos + 0.25, y: 2.65 + j * 0.52, w: 0.08, h: 0.08,
        fill: { color: col.color }
      });
      slide.addText(item, {
        x: xPos + 0.45, y: 2.58 + j * 0.52, w: 3.1, h: 0.48,
        fontSize: 9.5, fontFace: "Arial", color: COLORS.textDark, lineSpacing: 13
      });
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 12 provides complete technical transparency.
In software demonstrations, many vendors present slide mockups or prototype wireframes that do not actually work.
At ODC Odyssey, we hold ourselves to rigorous evidence standards. Every single item listed in the green column is fully built, backed by database migrations, and operational in our live codebase right now.
The yellow column highlights our integration-ready capabilities where the backend tables and APIs are ready to connect to external hospital hardware and PhilHealth portals.
And the blue column details our planned public health roadmap, including offline-first syncing for remote island health stations.`);
}

// ==============================================================================
// SLIDE 13: Transforming Philippine Healthcare: Odyssey vs Legacy Systems
// ==============================================================================
function buildSlide13() {
  const slide = createSlide(
    "IMPACT COMPARISON",
    "Transforming Philippine Healthcare: From Disconnected Silos to Unified Care"
  );

  const rows = [
    {
      dimension: "Patient Queueing & Triage",
      legacy: "2 to 4 hours standing in chaotic physical lines with handwritten number slips.",
      odyssey: "Digital self-booking, home triage, and live queue displays eliminating physical queues."
    },
    {
      dimension: "No Balance Billing (NBB) Care",
      legacy: "Opaque ledgers; indigent patients often forced into surprise out-of-pocket costs.",
      odyssey: "Automated NBB eligibility verification guaranteeing ₱0.00 bills for covered care."
    },
    {
      dimension: "Clinical Charting Burden",
      legacy: "15–20 minutes of handwritten carbon-copy charts; severe clinician exhaustion.",
      odyssey: "< 3 minutes with single-screen tri-service triage and pre-structured digital forms."
    },
    {
      dimension: "Public Pharmacy & Medicines",
      legacy: "Unmonitored stockouts forcing poor families to buy drugs from private pharmacies.",
      odyssey: "Multi-department inventory alerts preventing medicine stockouts before they happen."
    },
    {
      dimension: "Inter-Facility Connectivity",
      legacy: "Zero communication between municipal RHUs, district hospitals, and provincial centers.",
      odyssey: "FHIR-aligned longitudinal health record linking the entire provincial health network."
    }
  ];

  // Header row
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.6, w: 11.7, h: 0.5,
    fill: { color: COLORS.odcNavy }
  });
  slide.addText("PUBLIC HEALTHCARE DIMENSION", {
    x: 1.0, y: 1.72, w: 3.2, h: 0.3,
    fontSize: 10, fontFace: "Arial", bold: true, color: COLORS.textLight, charSpacing: 1
  });
  slide.addText("LEGACY DISCONNECTED PROCESSES", {
    x: 4.4, y: 1.72, w: 4.2, h: 0.3,
    fontSize: 10, fontFace: "Arial", bold: true, color: "FCA5A5", charSpacing: 1
  });
  slide.addText("ODC ODYSSEY HEALTHCARE OS", {
    x: 8.8, y: 1.72, w: 3.5, h: 0.3,
    fontSize: 10, fontFace: "Arial", bold: true, color: COLORS.odcOrange, charSpacing: 1
  });

  // Table rows
  rows.forEach((r, i) => {
    const yP = 2.2 + i * 0.95;
    const isEven = i % 2 === 0;

    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: 0.8, y: yP, w: 11.7, h: 0.85,
      fill: { color: isEven ? COLORS.cardBg : "F1F5F9" },
      line: { color: COLORS.cardBorder, width: 1 }
    });

    slide.addText(r.dimension, {
      x: 1.0, y: yP + 0.15, w: 3.2, h: 0.55,
      fontSize: 11, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(r.legacy, {
      x: 4.4, y: yP + 0.12, w: 4.2, h: 0.62,
      fontSize: 9.5, fontFace: "Arial", color: "991B1B", lineSpacing: 13
    });
    slide.addText(r.odyssey, {
      x: 8.8, y: yP + 0.12, w: 3.5, h: 0.62,
      fontSize: 9.5, fontFace: "Arial", bold: true, color: "065F46", lineSpacing: 13
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 13 provides a clear comparison between legacy hospital processes and Odyssey OS.
Most hospital software in the Philippines was written fifteen years ago as local desktop software for private clinic billing.
They were never designed for Universal Health Care. They do not automate No Balance Billing; they do not connect to municipal health units; and they force clinicians to spend more time entering data than looking at the patient.
Odyssey is fundamentally different.
We built this system around patient equity, NBB protection, frontline worker relief, and whole-province network connectivity.`);
}

// ==============================================================================
// SLIDE 14: Universal Health Care (UHC) & Statutory Compliance
// ==============================================================================
function buildSlide14() {
  const slide = createSlide(
    "STATUTORY COMPLIANCE & LEGAL ALIGNMENT",
    "Engineered to Fulfill Republic Act 11223 and National Healthcare Mandates"
  );

  const laws = [
    {
      title: "Republic Act No. 11223",
      name: "UNIVERSAL HEALTH CARE ACT",
      accent: COLORS.accentGreen,
      bg: COLORS.accentGreenBg,
      points: [
        "Integrates municipal Rural Health Units (RHUs) and provincial hospitals into a unified Province-wide Health System (PWHS).",
        "Mandates comprehensive primary care access through accredited PhilHealth Konsulta health networks.",
        "Guarantees that no Filipino shall suffer financial ruin due to necessary medical care."
      ]
    },
    {
      title: "PhilHealth NBB & Circulars",
      name: "NO BALANCE BILLING MANDATE",
      accent: COLORS.odcOrange,
      bg: COLORS.odcOrangeLight,
      points: [
        "Guarantees zero co-payment and zero out-of-pocket expenses for indigent, sponsored, and 4Ps beneficiaries.",
        "Audits hospital billing ledgers to ensure PhilHealth case-rate payments fully absorb inpatient costs.",
        "Requires public facilities to maintain continuous pharmacy inventory so patients never buy drugs outside."
      ]
    },
    {
      title: "Republic Act No. 10173",
      name: "DATA PRIVACY ACT OF 2012",
      accent: COLORS.odcNavy,
      bg: "E2E8F0",
      points: [
        "Enforces strict statutory protections for Sensitive Personal Information (SPI) in digital medical records.",
        "Requires institutional multi-tenant data segregation, encrypted storage, and role-based access limits.",
        "Mandates immutable electronic audit logs recording all access, modifications, and clinical disclosures."
      ]
    }
  ];

  laws.forEach((l, i) => {
    const xPos = 0.8 + i * 3.95;
    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: xPos, y: 1.6, w: 3.75, h: 5.1,
      fill: { color: COLORS.cardBg },
      line: { color: COLORS.cardBorder, width: 1.5 }
    });
    // Top colored banner
    slide.addShape(SHAPES.RECTANGLE, {
      x: xPos, y: 1.6, w: 3.75, h: 0.1,
      fill: { color: l.accent }
    });
    slide.addText(l.name, {
      x: xPos + 0.25, y: 1.85, w: 3.25, h: 0.25,
      fontSize: 9, fontFace: "Arial", bold: true, color: l.accent, charSpacing: 1.5
    });
    slide.addText(l.title, {
      x: xPos + 0.25, y: 2.15, w: 3.25, h: 0.4,
      fontSize: 16, fontFace: "Arial", bold: true, color: COLORS.textDark
    });

    l.points.forEach((pt, j) => {
      slide.addShape(SHAPES.OVAL, {
        x: xPos + 0.25, y: 2.85 + j * 1.3, w: 0.1, h: 0.1,
        fill: { color: l.accent }
      });
      slide.addText(pt, {
        x: xPos + 0.45, y: 2.75 + j * 1.3, w: 3.05, h: 1.2,
        fontSize: 10.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 15
      });
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 14 outlines the statutory and regulatory foundation of Odyssey OS.
Our architecture was intentionally designed around three critical Philippine laws:
First, Republic Act 11223, the Universal Health Care Act of 2019. Odyssey provides the digital backbone to establish Province-wide Health Systems by linking municipal primary care clinics directly to provincial referral hospitals.
Second, PhilHealth's No Balance Billing policies. By enforcing automated eligibility checking at triage, Odyssey guarantees that indigent patients receive their statutory right to zero out-of-pocket hospitalization.
Third, the Data Privacy Act of 2012. Odyssey complies with National Privacy Commission regulations through tenant-isolated Row-Level Security, AES-256 encryption, and tamper-evident audit logs.`);
}

// ==============================================================================
// SLIDE 15: Strategic Technical Roadmap for Philippine Public Health
// ==============================================================================
function buildSlide15() {
  const slide = createSlide(
    "LOOKING AHEAD",
    "Strategic Public Health Roadmap: Extending Care to Every Island and Barangay"
  );

  const phases = [
    {
      phase: "PHASE 1: NEXT 6 MONTHS",
      title: "Direct PhilHealth eClaims Bridge",
      desc: "Integrate direct electronic claims transmission via the PhilHealth Web Services API. Automatically generates eClaims XML/JSON packets directly from verified No Balance Billing records, slashing claim processing turnaround from months to hours."
    },
    {
      phase: "PHASE 2: 6 TO 12 MONTHS",
      title: "Offline-First Sync for Remote Islands (GIDA)",
      desc: "Deploy progressive web app (PWA) offline caching with local SQLite databases for Geographically Isolated and Disadvantaged Areas. Midwives and rural doctors record consultations during island power outages, automatically synchronizing when internet reconnects."
    },
    {
      phase: "PHASE 3: 12 TO 18 MONTHS",
      title: "DOH UHIS National Health Data Exchange",
      desc: "Implement automated FHIR R4 clinical data export pipelines complying with the DOH Unified Health Information System (UHIS). Enables seamless longitudinal patient record sharing across all public and accredited private facilities nationwide."
    }
  ];

  phases.forEach((p, i) => {
    const yP = 1.6 + i * 1.7;

    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: 0.8, y: yP, w: 11.7, h: 1.5,
      fill: { color: COLORS.cardBg },
      line: { color: COLORS.cardBorder, width: 1.5 }
    });
    // Left decorative bar in ODC Orange
    slide.addShape(SHAPES.RECTANGLE, {
      x: 0.8, y: yP, w: 0.1, h: 1.5,
      fill: { color: COLORS.odcOrange }
    });
    // Phase tag pill
    slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
      x: 1.1, y: yP + 0.18, w: 2.5, h: 0.32,
      fill: { color: COLORS.odcOrangeLight }
    });
    slide.addText(p.phase, {
      x: 1.1, y: yP + 0.22, w: 2.5, h: 0.25,
      fontSize: 9.5, fontFace: "Arial", bold: true, color: COLORS.odcOrangeDark, align: "center"
    });

    slide.addText(p.title, {
      x: 3.8, y: yP + 0.18, w: 8.4, h: 0.35,
      fontSize: 15, fontFace: "Arial", bold: true, color: COLORS.textDark
    });
    slide.addText(p.desc, {
      x: 3.8, y: yP + 0.55, w: 8.4, h: 0.8,
      fontSize: 10.5, fontFace: "Arial", color: COLORS.textMuted, lineSpacing: 14
    });
  });

  slide.addNotes(`SPEAKER NOTES:
Slide 15 presents our engineering roadmap for expanding public healthcare reach.
Our next milestone is the direct PhilHealth eClaims bridge. By transmitting verified NBB claim packets directly to PhilHealth, public hospitals can receive their capitation and case rate reimbursements in days rather than waiting six months for paper checks.
Next, we are solving the island connectivity challenge. In Geographically Isolated and Disadvantaged Areas—our GIDA municipalities—power and internet fail regularly. We are building an offline-first SQLite PWA architecture so rural health workers can continue documenting patient visits completely offline.
Finally, we will link directly with the DOH Unified Health Information System to enable national FHIR R4 interoperability.`);
}

// ==============================================================================
// SLIDE 16: Closing & Commitment (Official ODC Branding & Tagline)
// ==============================================================================
function buildSlide16() {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.odcDarkBg };

  // Top border highlight in ODC Orange
  slide.addShape(SHAPES.RECTANGLE, {
    x: 0, y: 0, w: 13.33, h: 0.15,
    fill: { color: COLORS.odcOrange }
  });

  // Embed Real ODC 3D Logo prominently
  if (brandLogoPath && fs.existsSync(brandLogoPath)) {
    slide.addImage({
      path: brandLogoPath,
      x: 1.0,
      y: 1.5,
      w: 2.8,
      h: 2.8,
    });
  }

  // Official Tagline Banner
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 4.2, y: 1.5, w: 5.6, h: 0.4,
    fill: { color: "1E2A44" },
    line: { color: COLORS.odcOrange, width: 1.5 }
  });
  slide.addText("YOUR COMPANION TOWARDS YOUR DIGITAL JOURNEY", {
    x: 4.2, y: 1.5, w: 5.6, h: 0.4,
    fontSize: 10, fontFace: "Arial", bold: true, color: COLORS.odcOrange, align: "center"
  });

  // Closing Title
  slide.addText("Partnering to Transform Philippine Healthcare", {
    x: 4.2, y: 2.05, w: 8.3, h: 0.8,
    fontSize: 28, fontFace: "Arial", bold: true, color: COLORS.textLight
  });

  slide.addText("A modern public health system where no Filipino is denied care due to poverty, and no healthcare worker is lost to burnout.", {
    x: 4.2, y: 2.85, w: 8.3, h: 0.65,
    fontSize: 14, fontFace: "Arial", color: "CBD5E1", lineSpacing: 16
  });

  // Action / Consortium Box
  slide.addShape(SHAPES.ROUNDED_RECTANGLE, {
    x: 4.2, y: 3.7, w: 8.3, h: 2.9,
    fill: { color: COLORS.cardDark },
    line: { color: "334155", width: 1.5 }
  });
  slide.addShape(SHAPES.RECTANGLE, {
    x: 4.2, y: 3.7, w: 8.3, h: 0.08,
    fill: { color: COLORS.odcOrange }
  });

  slide.addText("HOW WE WORK WITH PROVINCIAL & MUNICIPAL LEADERS", {
    x: 4.5, y: 3.95, w: 7.7, h: 0.3,
    fontSize: 10, fontFace: "Arial", bold: true, color: COLORS.odcOrange, charSpacing: 1.5
  });

  const nextSteps = [
    "1. Pilot Deployment: Roll out Odyssey OS in a selected Provincial Hospital and its feeder Rural Health Units (RHUs).",
    "2. Clinical Workflow Training: Hands-on onboarding for nurses, doctors, and pharmacists in under 48 hours.",
    "3. Automated NBB Verification: Full calibration of PhilHealth No Balance Billing to protect indigent patients immediately.",
    "4. Dedicated Public Health Support: ODC technical team provides continuous onsite and remote operational assistance."
  ];

  nextSteps.forEach((s, i) => {
    slide.addText(s, {
      x: 4.5, y: 4.35 + i * 0.48, w: 7.7, h: 0.42,
      fontSize: 10.5, fontFace: "Arial", color: "E2E8F0"
    });
  });

  // Contact Footer Cards
  slide.addText("Email: odysseyphitsolutions@gmail.com  ·  Web: odc.ph  ·  Facebook: ODC", {
    x: 0.8, y: 7.0, w: 11.7, h: 0.25,
    fontSize: 10, fontFace: "Arial", bold: true, color: COLORS.odcOrange
  });

  slide.addNotes(`SPEAKER NOTES:
In closing, ODC Odyssey Healthcare OS is ready to deploy.
We invite provincial governors, city mayors, hospital directors, and municipal health officers to join us in bringing digital dignity to Philippine healthcare.
Together, we can realize the true promise of Republic Act 11223: a healthcare system that protects every Filipino family from out-of-pocket ruin and empowers our frontline medical workers with the modern digital tools they deserve.
Thank you very much. Let us begin this journey together.`);
}

// ==============================================================================
// MAIN EXECUTION: Generate the Complete Deck
// ==============================================================================
async function generateDeck() {
  console.log("Generating Odyssey Healthcare OS Presentation with Official ODC Branding...");
  buildSlide1();
  buildSlide2();
  buildSlide3();
  buildSlide4();
  buildSlide5();
  buildSlide6();
  buildSlide7();
  buildSlide8();
  buildSlide9();
  buildSlide10();
  buildSlide11();
  buildSlide12();
  buildSlide13();
  buildSlide14();
  buildSlide15();
  buildSlide16();

  await pptx.writeFile({ fileName: outputPptx });
  console.log(`Successfully generated pitch deck presentation: ${outputPptx}`);
}

generateDeck().catch((err) => {
  console.error("Error generating presentation:", err);
  process.exit(1);
});
