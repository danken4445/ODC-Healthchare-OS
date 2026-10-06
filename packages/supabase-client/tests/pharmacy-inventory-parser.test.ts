import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizePharmacyExpiryDate,
  normalizeDeliveryDate,
  inferPharmacyUnitOfMeasure,
  parsePharmacyInventoryWorkbook,
} from "../src/pharmacy-inventory-parser.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("normalizePharmacyExpiryDate handles Excel serial dates, human formats, and nulls", () => {
  assert.equal(normalizePharmacyExpiryDate(""), null);
  assert.equal(normalizePharmacyExpiryDate(null), null);
  assert.equal(normalizePharmacyExpiryDate(undefined), null);
  assert.equal(normalizePharmacyExpiryDate("   "), null);
  assert.equal(normalizePharmacyExpiryDate("NONE"), null);
  assert.equal(normalizePharmacyExpiryDate("N/A"), null);

  // Month + Year: "OCT. 2026", "DEC. 2027", "FEB. 2027"
  assert.equal(normalizePharmacyExpiryDate("OCT. 2026"), "2026-10-31");
  assert.equal(normalizePharmacyExpiryDate("DEC. 2027"), "2027-12-31");
  assert.equal(normalizePharmacyExpiryDate("FEB. 2027"), "2027-02-28");
  assert.equal(normalizePharmacyExpiryDate("JUNE. 2028"), "2028-06-30");
  assert.equal(normalizePharmacyExpiryDate("AUG.2026"), "2026-08-31");

  // Excel serial numbers
  assert.equal(normalizePharmacyExpiryDate(46569), "2027-07-01");
  assert.equal(normalizePharmacyExpiryDate(46905), "2028-06-01");
  assert.equal(normalizePharmacyExpiryDate("46569"), "2027-07-01");

  // MM/YYYY
  assert.equal(normalizePharmacyExpiryDate("7/2027"), "2027-07-31");

  // MM/DD/YY
  assert.equal(normalizePharmacyExpiryDate("11/19/26"), "2026-11-19");
});

test("inferPharmacyUnitOfMeasure identifies accurate packaging and dosage forms", () => {
  assert.equal(inferPharmacyUnitOfMeasure("500mg tablet", "Paracetamol", "MEDICINES"), "tablet");
  assert.equal(inferPharmacyUnitOfMeasure("500mg capsule", "Amoxicillin", "MEDICINES"), "capsule");
  assert.equal(inferPharmacyUnitOfMeasure("3mg/mL, 2mL vial", "Adenosine", "MEDICINES"), "vial");
  assert.equal(inferPharmacyUnitOfMeasure("25mg/mL, 10mL ampule", "Aminophylline", "MEDICINES"), "ampule");
  assert.equal(inferPharmacyUnitOfMeasure("20%, 50mL IV bottle", "Albumin, Human", "MEDICINES"), "bottle");
  assert.equal(inferPharmacyUnitOfMeasure("5g cream tube", "Betamethasone", "MEDICINES"), "tube");
  assert.equal(inferPharmacyUnitOfMeasure("250mcg/mL, 2mL Nebule", "Budesonide", "MEDICINES"), "nebule");
  assert.equal(inferPharmacyUnitOfMeasure("Oral Solution", "Acetylcysteine", "MEDICINES"), "sachet");
  assert.equal(inferPharmacyUnitOfMeasure("Bandage", "Elastic Bandage 2\"", "MEDICAL SUPPLIES"), "roll");
  assert.equal(inferPharmacyUnitOfMeasure("suture", "Silk 1/0 round", "SUTURES"), "piece");
});

test("parsePharmacyInventoryWorkbook parses the real-world Pharmacy Excel fixture", () => {
  const fixturePath = path.resolve(__dirname, "../../../docs/pharmacy-inventory-sample.xlsx");
  assert.equal(fs.existsSync(fixturePath), true, "Pharmacy fixture file must exist");

  const fileBuffer = fs.readFileSync(fixturePath);
  const result = parsePharmacyInventoryWorkbook(fileBuffer, "INVENTORY");

  // Validate sheet discovery
  assert.ok(result.sheetsAvailable.includes("INVENTORY"));
  assert.ok(result.sheetsAvailable.includes("OPD MEDS"));
  assert.ok(result.sheetsAvailable.includes("NEAR EXPIRY"));
  assert.ok(result.sheetsAvailable.includes("REQUEST"));

  // Validate total item count
  assert.ok(result.totalParsed >= 350, `Expected >= 350 items, got ${result.totalParsed}`);
  assert.ok(result.datedCount >= 20, `Expected >= 20 dated items, got ${result.datedCount}`);
  assert.ok(result.withStockCount >= 25, `Expected >= 25 items with stock > 0, got ${result.withStockCount}`);

  // Validate categories
  assert.ok(result.categoriesFound.includes("MEDICINES"));
  assert.ok(result.categoriesFound.includes("DANGEROUS DRUGS"));
  assert.ok(result.categoriesFound.includes("ANESTHESIA MEDICINES"));
  assert.ok(result.categoriesFound.includes("FAST MOVING INTRAVENOUS FLUIDS"));
  assert.ok(result.categoriesFound.includes("SUTURES"));
  assert.ok(result.categoriesFound.includes("MEDICAL SUPPLIES"));

  // Validate specific high-value items
  const adenosine = result.items.find((i) => i.genericName.includes("Adenosine"));
  assert.ok(adenosine, "Adenosine must be present");
  assert.equal(adenosine.brandName, "TACHYBAN");
  assert.equal(adenosine.lotNumber, "T230541");
  assert.equal(adenosine.expiryDateNormalized, "2026-10-31");
  assert.equal(adenosine.actualBalance, 119);
  assert.equal(adenosine.effectiveQuantity, 119);

  const albumin = result.items.find((i) => i.genericName.includes("Albumin"));
  assert.ok(albumin, "Albumin must be present");
  assert.equal(albumin.brandName, "SEROALBUMIN");
  assert.equal(albumin.lotNumber, "ALB300723");
  assert.equal(albumin.expiryDateNormalized, "2026-11-30");
  assert.equal(albumin.actualBalance, 58);

  const zilgam = result.items.find((i) => i.brandName === "ZILGAM");
  assert.ok(zilgam, "Zilgam must be present");
  assert.equal(zilgam.lotNumber, "Z-47025");
  assert.equal(zilgam.expiryDateNormalized, "2027-12-31");
  assert.equal(zilgam.actualBalance, 9592);

  // Validate continuation batch/brand (LESTOR under Atorvastatin)
  const lestor = result.items.find((i) => i.brandName === "LESTOR");
  assert.ok(lestor, "Continuation batch LESTOR must be attributed to Atorvastatin");
  assert.ok(lestor.genericName.includes("Atorvastatin"));
  assert.equal(lestor.lotNumber, "241216");
  assert.equal(lestor.expiryDateNormalized, "2027-12-31");
  assert.equal(lestor.actualBalance, 2900);
});
