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

test("parsePharmacyInventoryWorkbook accurately parses integrated inventory & price list CSV format", () => {
  const sampleCsv = `category,item,dosage_or_size,brand,balance_oct_05_2026,doh_srp_php,dpri_php,bizbox_price_php,affiliated_pharmacy_price_php,match_status,price_list_item,candidate_prices_php,source_sheet,source_row,pdf_page,source_price_text,notes
Medicines,Acetylcysteine,600mg Powder for Oral Solution,CILESTINE,0,38.75,,38.75,,Matched,Acetylcysteine 600mg tablet/powder,,INVENTORY,6,1,38.75 | - | 38.75 | ,Reviewed match; equivalent strength or dosage wording.
Medicines,Acetazolamide,250 mg Tablet,CETAMID,0,,18.5,112.75,,Matched,Acetazolamide 250mg tablet,,INVENTORY,7,1,- | 18.50 | 112.75 | ,"Matched after normalizing spelling, punctuation and formulation wording."
Medicines,Adenosine,"3mg/mL , 2mL vial",TACHYBAN,119,,1960.0,1960.0,,Matched,"Adenosine 3mg/ml, 2ml vial",,INVENTORY,9,1,"- | 1,960.00 | 1,960.00 | ","Matched after normalizing spelling, punctuation and formulation wording."
Medical supplies,Chromic 0 round,,N/A,0,,,,,Review required,Chromic 2.0 round, |  | 429.00 | 150.00,INVENTORY,250,5, |  | 429.00 | 150.00,"Candidate only; verify dosage, formulation, pack size or unit before using prices."
Medical supplies,Monocryl 4/0 cutting,suture,N/A,25,,,1111.0,1500.0,Matched,Monocryl 4.0 cutting,,INVENTORY,255,6," |  | 1,111.00 | 1,500.00","Matched after normalizing spelling, punctuation and formulation wording."`;

  const result = parsePharmacyInventoryWorkbook(sampleCsv);

  assert.equal(result.totalParsed, 5);
  assert.equal(result.items.length, 5);
  assert.ok(result.categoriesFound.includes("MEDICINES"));
  assert.ok(result.categoriesFound.includes("MEDICAL SUPPLIES"));

  // Check Acetylcysteine
  const acetylcysteine = result.items[0];
  assert.equal(acetylcysteine.genericName, "Acetylcysteine");
  assert.equal(acetylcysteine.dosageForm, "600mg Powder for Oral Solution");
  assert.equal(acetylcysteine.brandName, "CILESTINE");
  assert.equal(acetylcysteine.effectiveQuantity, 0);
  assert.equal(acetylcysteine.dohSrpPhp, 38.75);
  assert.equal(acetylcysteine.bizboxPricePhp, 38.75);
  assert.equal(acetylcysteine.sellingPrice, 38.75);
  assert.equal(acetylcysteine.unitCost, 38.75);
  assert.equal(acetylcysteine.unitOfMeasure, "sachet");

  // Check Acetazolamide
  const acetazolamide = result.items[1];
  assert.equal(acetazolamide.genericName, "Acetazolamide");
  assert.equal(acetazolamide.dosageForm, "250 mg Tablet");
  assert.equal(acetazolamide.brandName, "CETAMID");
  assert.equal(acetazolamide.effectiveQuantity, 0);
  assert.equal(acetazolamide.dpriPhp, 18.5);
  assert.equal(acetazolamide.bizboxPricePhp, 112.75);
  assert.equal(acetazolamide.sellingPrice, 112.75);
  assert.equal(acetazolamide.unitCost, 18.5);
  assert.equal(acetazolamide.unitOfMeasure, "tablet");

  // Check Adenosine
  const adenosine = result.items[2];
  assert.equal(adenosine.genericName, "Adenosine");
  assert.equal(adenosine.dosageForm, "3mg/mL , 2mL vial");
  assert.equal(adenosine.brandName, "TACHYBAN");
  assert.equal(adenosine.effectiveQuantity, 119);
  assert.equal(adenosine.dpriPhp, 1960.0);
  assert.equal(adenosine.bizboxPricePhp, 1960.0);
  assert.equal(adenosine.sellingPrice, 1960.0);
  assert.equal(adenosine.unitCost, 1960.0);
  assert.equal(adenosine.unitOfMeasure, "vial");

  // Check Monocryl
  const monocryl = result.items[4];
  assert.equal(monocryl.category, "MEDICAL SUPPLIES");
  assert.equal(monocryl.genericName, "Monocryl 4/0 cutting");
  assert.equal(monocryl.brandName, null);
  assert.equal(monocryl.effectiveQuantity, 25);
  assert.equal(monocryl.bizboxPricePhp, 1111.0);
  assert.equal(monocryl.affiliatedPharmacyPricePhp, 1500.0);
  assert.equal(monocryl.sellingPrice, 1111.0);
  assert.equal(monocryl.unitOfMeasure, "piece");
});

