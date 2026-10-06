import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeGsoExpiryDate,
  parseGsoInventoryCsv,
} from "../src/gso-csv-parser.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("normalizeGsoExpiryDate handles varied formats and returns null for optional/empty dates", () => {
  // Empty / Null
  assert.equal(normalizeGsoExpiryDate(""), null);
  assert.equal(normalizeGsoExpiryDate(null), null);
  assert.equal(normalizeGsoExpiryDate(undefined), null);
  assert.equal(normalizeGsoExpiryDate("   "), null);
  assert.equal(normalizeGsoExpiryDate("NONE"), null);
  assert.equal(normalizeGsoExpiryDate("N/A"), null);

  // MM/YYYY -> Last day of month
  assert.equal(normalizeGsoExpiryDate("7/2027"), "2027-07-31");
  assert.equal(normalizeGsoExpiryDate("8/2026"), "2026-08-31");
  assert.equal(normalizeGsoExpiryDate("4/2027"), "2027-04-30");
  assert.equal(normalizeGsoExpiryDate("11/2029"), "2029-11-30");

  // MM/DD/YY -> 20YY-MM-DD
  assert.equal(normalizeGsoExpiryDate("11/19/26"), "2026-11-19");

  // MM/DD/YYYY -> YYYY-MM-DD
  assert.equal(normalizeGsoExpiryDate("9/14/2029"), "2029-09-14");

  // Named Month + Year
  assert.equal(normalizeGsoExpiryDate("SEPT. 2027"), "2027-09-30");
  assert.equal(normalizeGsoExpiryDate("MARCH 2027"), "2027-03-31");

  // Named Month + Day + Year
  assert.equal(normalizeGsoExpiryDate("AUG. 5, 2027"), "2027-08-05");

  // Year only -> End of year
  assert.equal(normalizeGsoExpiryDate("2028"), "2028-12-31");
});

test("parseGsoInventoryCsv accurately parses the real-world GSO CSV fixture", () => {
  const fixturePath = path.resolve(__dirname, "../../../docs/gso-inventory-sample.csv");
  assert.equal(fs.existsSync(fixturePath), true, "Fixture file must exist");

  const csvContent = fs.readFileSync(fixturePath, "utf-8");
  const result = parseGsoInventoryCsv(csvContent);

  // Assert overall extraction counts
  assert.ok(result.totalParsed >= 200, `Expected at least 200 items, got ${result.totalParsed}`);
  assert.ok(result.datedCount >= 15, `Expected at least 15 dated items, got ${result.datedCount}`);
  assert.ok(result.undatedCount >= 180, `Expected at least 180 undated items, got ${result.undatedCount}`);

  // Assert category discovery
  assert.ok(result.categoriesFound.includes("OFFICE SUPPLIES"));
  assert.ok(result.categoriesFound.includes("GSO MEDICAL SUPPLIES"));
  assert.ok(result.categoriesFound.includes("LAUNDRY & JANITORIAL SUPPLIES"));
  assert.ok(result.categoriesFound.includes("MEDICAL EQUIPMENTS"));
  assert.ok(result.categoriesFound.includes("ICT, OFFICE SUPPLIES"));

  // Check specific office supply item with no expiry
  const ballpen = result.items.find((i) => i.description === "BALLPEN black");
  assert.ok(ballpen, "BALLPEN black must be parsed");
  assert.equal(ballpen.category, "OFFICE SUPPLIES");
  assert.equal(ballpen.unitOfMeasure, "pcs");
  assert.equal(ballpen.expiryDateNormalized, null);

  // Check medical supply with MM/YYYY expiry
  const ambuBag = result.items.find((i) => i.description === "AMBU BAG ADULT");
  assert.ok(ambuBag, "AMBU BAG ADULT must be parsed");
  assert.equal(ambuBag.category, "GSO MEDICAL SUPPLIES");
  assert.equal(ambuBag.expiryDateNormalized, "2027-07-31");
  assert.equal(ambuBag.unitOfMeasure, "pcs");

  // Check medical supply with MM/DD/YY expiry
  const cordClamp = result.items.find((i) => i.description === "CORD CLAMP");
  assert.ok(cordClamp, "CORD CLAMP must be parsed");
  assert.equal(cordClamp.expiryDateNormalized, "2026-11-19");

  // Check item with named month expiry
  const lubeGel = result.items.find(
    (i) => i.description === "LUBRICATING GEL" && i.expiryDateRaw?.includes("AUG")
  );
  assert.ok(lubeGel, "LUBRICATING GEL with AUG date must be parsed");
  assert.equal(lubeGel.expiryDateNormalized, "2027-08-05");
  assert.equal(lubeGel.unitOfMeasure, "tube");

  // Check medical supply with optional/omitted expiry
  const charcoal = result.items.find((i) => i.description === "ACTIVATED CHARCOAL");
  assert.ok(charcoal, "ACTIVATED CHARCOAL must be parsed");
  assert.equal(charcoal.expiryDateNormalized, null);
  assert.equal(charcoal.unitOfMeasure, "pcs");
});
