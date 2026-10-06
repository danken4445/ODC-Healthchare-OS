import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateReportDates,
  getDefaultHeaderConfig,
  computeDepartmentInventoryReport,
  buildInventoryReportCsv,
  buildInventoryReportPrintDocument,
  type DepartmentInventoryReport,
} from "./inventory-report-document.ts";

test("calculateReportDates generates correct ISO date boundaries for weekly, monthly, and custom days", () => {
  const weekly = calculateReportDates("weekly");
  assert.ok(weekly.startDate <= weekly.endDate);
  assert.match(weekly.label, /Weekly/);

  const monthly = calculateReportDates("monthly");
  assert.ok(monthly.startDate < monthly.endDate);
  assert.match(monthly.label, /Monthly/);

  const customDays = calculateReportDates("custom_days", 14);
  assert.ok(customDays.startDate <= customDays.endDate);
  assert.match(customDays.label, /Past 14 Days/);

  const customRange = calculateReportDates("custom_range", undefined, "2026-10-01", "2026-10-07");
  assert.equal(customRange.startDate, "2026-10-01");
  assert.equal(customRange.endDate, "2026-10-07");
});

test("getDefaultHeaderConfig returns pharmacy or GSO specific templates", () => {
  const pharmHeader = getDefaultHeaderConfig("Pharmacy Department", true, false, "San Juan District Hospital");
  assert.equal(pharmHeader.template, "pharmacy");
  assert.match(pharmHeader.departmentTitle, /PHARMACY DEPARTMENT/);
  assert.match(pharmHeader.institutionName, /SAN JUAN DISTRICT HOSPITAL/);

  const gsoHeader = getDefaultHeaderConfig("Central Supply", false, true, "Municipality of Bolinao");
  assert.equal(gsoHeader.template, "gso");
  assert.match(gsoHeader.departmentTitle, /GENERAL SERVICES OFFICE/);
});

test("computeDepartmentInventoryReport correctly balances starting, received, dispensed, and ending stock", () => {
  const period = calculateReportDates("custom_range", undefined, "2026-10-01", "2026-10-07");
  const header = getDefaultHeaderConfig("Pharmacy", true, false, "Test Clinic");

  const report = computeDepartmentInventoryReport({
    departmentId: "dept-pharm-01",
    departmentName: "Pharmacy",
    isPharmacy: true,
    organizationId: "org-01",
    organizationName: "Test Clinic",
    period,
    headerConfig: header,
    items: [
      {
        id: "item-amox",
        name: "Amoxicillin 500mg",
        description: "Capsule",
        unit_of_measure: "capsule",
        unit_cost: 350, // 3.50 PHP in centavos
      },
      {
        id: "item-para",
        name: "Paracetamol 500mg",
        description: "Tablet",
        unit_of_measure: "tablet",
        unit_cost: 150, // 1.50 PHP in centavos
      },
    ],
    stock: [
      {
        item_id: "item-amox",
        department_id: "dept-pharm-01",
        quantity: 100,
        reorder_level: 20,
      },
      {
        item_id: "item-para",
        department_id: "dept-pharm-01",
        quantity: 50,
        reorder_level: 10,
      },
    ],
    batches: [
      {
        id: "batch-amox-1",
        item_id: "item-amox",
        department_id: "dept-pharm-01",
        lot_number: "LOT-2026-A",
        expiry_date: "2027-12-31",
        quantity: 100,
        days_until_expiry: 400,
        expiry_status: "ok",
      },
    ],
    movements: [
      // Amoxicillin received 40 on Oct 03
      {
        id: "mov-1",
        item_id: "item-amox",
        department_id: "dept-pharm-01",
        movement_type: "receipt",
        quantity_delta: 40,
        occurred_at: "2026-10-03T10:00:00Z",
      },
      // Amoxicillin dispensed 10 on Oct 05
      {
        id: "mov-2",
        item_id: "item-amox",
        department_id: "dept-pharm-01",
        movement_type: "usage",
        quantity_delta: -10,
        occurred_at: "2026-10-05T14:00:00Z",
      },
    ],
  });

  assert.equal(report.departmentName, "Pharmacy");
  assert.equal(report.rows.length, 2);

  const amoxRow = report.rows.find((r) => r.itemId === "item-amox");
  assert.ok(amoxRow);
  assert.equal(amoxRow.endingBalance, 100);
  assert.equal(amoxRow.receivedQuantity, 40);
  assert.equal(amoxRow.dispensedQuantity, 10);
  // starting = ending (100) - netDelta (30) = 70
  assert.equal(amoxRow.startingBalance, 70);
  assert.equal(amoxRow.totalValueInCentavos, 35000); // 100 * 350 centavos = 350.00 PHP
});

test("buildInventoryReportPrintDocument embeds custom uploaded header image and escapes HTML", () => {
  const period = calculateReportDates("weekly");
  const header = getDefaultHeaderConfig("Pharmacy", true, false, "Test Clinic");
  header.customHeaderImageUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const mockReport: DepartmentInventoryReport = {
    organizationId: "org-1",
    organizationName: "Test Clinic",
    departmentId: "dept-1",
    departmentName: "Pharmacy",
    isPharmacy: true,
    isRootSupply: false,
    period,
    headerConfig: header,
    generatedAt: "2026-10-07T00:00:00Z",
    metrics: {
      totalLines: 1,
      totalStartingUnits: 50,
      totalReceivedUnits: 20,
      totalDispensedUnits: 10,
      totalEndingUnits: 60,
      totalValuationInCentavos: 12000,
      lowStockCount: 0,
      nearExpiryCount: 0,
      expiredCount: 0,
    },
    rows: [
      {
        itemId: "item-1",
        itemName: "Paracetamol <500mg>",
        dosageOrDescription: "Tablet",
        category: "MEDICINES",
        unitOfMeasure: "tab",
        lotNumber: "LOT-99",
        expiryDate: "2027-05-20",
        expiryStatus: "ok",
        startingBalance: 50,
        receivedQuantity: 20,
        dispensedQuantity: 10,
        adjustmentsQuantity: 0,
        endingBalance: 60,
        unitCostInCentavos: 200,
        totalValueInCentavos: 12000,
      },
    ],
  };

  const html = buildInventoryReportPrintDocument(mockReport);
  assert.match(html, /<img src="data:image\/png;base64/);
  assert.match(html, /Paracetamol &lt;500mg&gt;/);
  assert.doesNotMatch(html, /Paracetamol <500mg>/);
  assert.match(html, /@page\s*\{\s*size:\s*A4 landscape;/);
});

test("buildInventoryReportCsv builds escaped, injection-safe spreadsheet output", () => {
  const period = calculateReportDates("weekly");
  const header = getDefaultHeaderConfig("Pharmacy", true, false, "Test Clinic");

  const mockReport: DepartmentInventoryReport = {
    organizationId: "org-1",
    organizationName: "Test Clinic",
    departmentId: "dept-1",
    departmentName: "Pharmacy",
    isPharmacy: true,
    isRootSupply: false,
    period,
    headerConfig: header,
    generatedAt: "2026-10-07T00:00:00Z",
    metrics: {
      totalLines: 1,
      totalStartingUnits: 10,
      totalReceivedUnits: 5,
      totalDispensedUnits: 2,
      totalEndingUnits: 13,
      totalValuationInCentavos: 2600,
      lowStockCount: 0,
      nearExpiryCount: 0,
      expiredCount: 0,
    },
    rows: [
      {
        itemId: "item-1",
        itemName: "=HYPERLINK(\"http://evil.com\")",
        dosageOrDescription: "Suspension",
        category: "MEDICINES",
        unitOfMeasure: "bottle",
        lotNumber: "LOT-1",
        expiryDate: "2027-01-01",
        expiryStatus: "ok",
        startingBalance: 10,
        receivedQuantity: 5,
        dispensedQuantity: 2,
        adjustmentsQuantity: 0,
        endingBalance: 13,
        unitCostInCentavos: 200,
        totalValueInCentavos: 2600,
      },
    ],
  };

  const csv = buildInventoryReportCsv(mockReport);
  assert.match(csv, /"'=HYPERLINK/); // Escaped formula prefix
  assert.match(csv, /"Generic \/ Item Name"/);
});
