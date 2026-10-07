import type {
  PharmacyInventoryImportRow,
  PharmacyInventoryParseResult,
} from "@odyssey/types";
import * as XLSX from "xlsx";

/**
 * Normalizes varied Excel serial dates, human dates, and month-year strings
 * to standard ISO YYYY-MM-DD. Returns null when omitted or invalid.
 */
export function normalizePharmacyExpiryDate(
  raw: string | number | null | undefined
): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // Handle Excel numeric date serials (e.g. 45611, 46569, 46905)
  if (typeof raw === "number") {
    if (raw > 20000 && raw < 80000) {
      const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }
  }

  const trimmed = String(raw).trim().replace(/^["']|["']$/g, "").trim();
  if (!trimmed || /^(none|n\/a|na|-|null)$/i.test(trimmed)) return null;

  // Check if string is numeric Excel serial (e.g. "46569")
  if (/^\d{5}$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num > 20000 && num < 80000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }
  }

  // Year only: e.g. "2028"
  if (/^\d{4}$/.test(trimmed)) {
    const year = parseInt(trimmed, 10);
    if (year >= 2020 && year <= 2099) {
      return `${year}-12-31`;
    }
  }

  // MM/YYYY: e.g. "7/2027", "07/2027"
  const mmyyyy = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmyyyy) {
    const month = parseInt(mmyyyy[1], 10);
    const year = parseInt(mmyyyy[2], 10);
    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // MM/DD/YY or MM/DD/YYYY: e.g. "11/19/26", "9/14/2029"
  const mmddyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mmddyy) {
    const month = parseInt(mmddyy[1], 10);
    const day = parseInt(mmddyy[2], 10);
    let year = parseInt(mmddyy[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2099) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const monthNames: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  // Month Name + Day + Year: e.g. "AUG. 5, 2027" or "AUG 5 2027"
  const nameDayYear = trimmed.match(/^([a-zA-Z.]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (nameDayYear) {
    const mStr = nameDayYear[1].toLowerCase().replace(/\./g, "");
    const mNum = monthNames[mStr];
    const day = parseInt(nameDayYear[2], 10);
    const year = parseInt(nameDayYear[3], 10);
    if (mNum && day >= 1 && day <= 31 && year >= 2020 && year <= 2099) {
      return `${year}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Named Month + Year: e.g. "OCT. 2026", "DEC. 2027", "APRIL. 2028", "AUG.2026"
  const nameYear = trimmed.match(/^([a-zA-Z]+)\.?\s*(\d{4})$/);
  if (nameYear) {
    const mStr = nameYear[1].toLowerCase().replace(/\./g, "");
    const mNum = monthNames[mStr];
    const year = parseInt(nameYear[2], 10);
    if (mNum && year >= 2020 && year <= 2099) {
      const lastDay = new Date(Date.UTC(year, mNum, 0)).getUTCDate();
      return `${year}-${String(mNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Normalizes delivery dates to ISO YYYY-MM-DD.
 */
export function normalizeDeliveryDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    if (raw > 20000 && raw < 80000) {
      const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }
  }
  const s = String(raw).trim();
  // Formats like DDMMYYYY (e.g. 11072025 -> 2025-07-11 or MM/DD/YYYY)
  const ddmmyyyy = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1], 10);
    const m = parseInt(ddmmyyyy[2], 10);
    const y = parseInt(ddmmyyyy[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2099) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return normalizePharmacyExpiryDate(raw);
}

/**
 * Automatically infers Unit of Measure from Dosage Form, Generic Name, and Category.
 */
export function inferPharmacyUnitOfMeasure(
  dosageForm?: string | null,
  genericName?: string | null,
  category?: string | null
): string {
  const text = `${dosageForm || ""} ${genericName || ""} ${category || ""}`.toLowerCase();

  if (text.includes("tablet") || text.includes("tab.") || text.includes("chewable")) return "tablet";
  if (text.includes("capsule") || text.includes("cap.") || text.includes("cap")) return "capsule";
  if (text.includes("ampule") || text.includes("ampul") || text.includes("amp.") || text.includes("amp")) return "ampule";
  if (text.includes("vial")) return "vial";
  if (text.includes("nebule") || text.includes("neb.") || text.includes("neb")) return "nebule";
  if (
    text.includes("sachet") ||
    text.includes("powder for oral solution") ||
    text.includes("powder for suspension") ||
    text.includes("granules for suspension") ||
    text.includes("oral solution") ||
    text.includes("granules")
  ) {
    return "sachet";
  }
  if (
    text.includes("bottle") ||
    text.includes("suspension") ||
    text.includes("syrup") ||
    text.includes("drops") ||
    text.includes("elixir") ||
    text.includes("solution") ||
    text.includes("iv fluid") ||
    text.includes("d5lr") ||
    text.includes("d10") ||
    text.includes("plain nss")
  ) {
    return "bottle";
  }
  if (text.includes("tube") || text.includes("ointment") || text.includes("cream") || text.includes("gel")) return "tube";
  if (text.includes("bandage") || text.includes("plaster") || text.includes("tape") || text.includes("roll")) return "roll";
  if (text.includes("box") || text.includes("boxes")) return "box";
  if (text.includes("set") || text.includes("soluset") || text.includes("macroset") || text.includes("microset")) return "set";
  if (text.includes("pair") || text.includes("gloves")) return "pair";
  if (text.includes("suture") || text.includes("vicryl") || text.includes("chromic") || text.includes("silk") || text.includes("prolene") || text.includes("ethilon")) return "piece";

  return "piece";
}

/**
 * Generates an automatic SKU from category, generic name, and dosage form.
 */
export function generatePharmacySku(category: string, genericName: string, dosageForm?: string | null): string {
  const catPrefix = category.slice(0, 3).toUpperCase();
  const rawText = `${genericName} ${dosageForm || ""}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `PHARM-${catPrefix}-${rawText}`;
}

/**
 * Parses a Pharmacy Inventory spreadsheet (XLSX, XLS, or CSV content/buffer).
 * Handles multi-section sheets like INVENTORY, OPD MEDS, NEAR EXPIRY, and REQUEST.
 */
export function parsePharmacyInventoryWorkbook(
  input: ArrayBuffer | Uint8Array | string,
  preferredSheet?: string
): PharmacyInventoryParseResult {
  let workbook: XLSX.WorkBook;

  if (typeof input === "string") {
    // Check if input is CSV text or Base64 / binary string
    if (input.includes("\n") || input.includes(",")) {
      workbook = XLSX.read(input, { type: "string" });
    } else {
      workbook = XLSX.read(input, { type: "base64" });
    }
  } else {
    workbook = XLSX.read(input, { type: "array" });
  }

  const sheetsAvailable = workbook.SheetNames || [];
  if (sheetsAvailable.length === 0) {
    return {
      sheetName: "",
      sheetsAvailable: [],
      items: [],
      totalParsed: 0,
      categoriesFound: [],
      datedCount: 0,
      undatedCount: 0,
      withStockCount: 0,
      zeroStockCount: 0,
      errors: [{ line: 0, message: "The uploaded file has no sheets." }],
    };
  }

  let sheetName = preferredSheet || "INVENTORY";
  if (!sheetsAvailable.includes(sheetName)) {
    // Try to find sheet containing "INVENTORY" or first sheet
    const found = sheetsAvailable.find((s) => s.toUpperCase().includes("INVENTORY")) || sheetsAvailable[0];
    sheetName = found;
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return {
      sheetName,
      sheetsAvailable,
      items: [],
      totalParsed: 0,
      categoriesFound: [],
      datedCount: 0,
      undatedCount: 0,
      withStockCount: 0,
      zeroStockCount: 0,
      errors: [{ line: 0, message: `Sheet '${sheetName}' not found in workbook.` }],
    };
  }

  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null });
  const items: PharmacyInventoryImportRow[] = [];
  const categoriesFound = new Set<string>();
  const errors: Array<{ line: number; message: string }> = [];

  let currentCategory = "MEDICINES";
  let lastGenericName = "";
  let lastDosageForm = "";

  // 1. Detect if sheet contains a structured header row (e.g. integrated inventory & pricing CSV)
  let headerRowIndex = -1;
  let colMap: Record<string, number> | null = null;

  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;
    const normalized = row.map((c) =>
      String(c ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s\-_]+/g, "_")
    );

    const hasItem = normalized.some((h) =>
      ["item", "generic_name", "generic", "drug_name", "drug", "medicine", "articles"].includes(h)
    );
    const hasCategory = normalized.includes("category");
    const hasDosageOrSize = normalized.some((h) =>
      ["dosage_or_size", "dosage", "size", "dosage_form", "strength"].includes(h)
    );
    const hasBalance = normalized.some((h) =>
      h.startsWith("balance") || ["quantity", "qty", "stock", "on_hand", "balance_oct_05_2026"].includes(h)
    );
    const hasPrice = normalized.some((h) =>
      ["bizbox_price_php", "dpri_php", "doh_srp_php", "selling_price", "unit_price", "unit_cost"].includes(h)
    );

    // If row contains item/generic and at least one other standard column header:
    if (hasItem && (hasCategory || hasDosageOrSize || hasBalance || hasPrice)) {
      headerRowIndex = r;
      colMap = {
        category: normalized.findIndex((h) => h === "category"),
        item: normalized.findIndex((h) =>
          ["item", "generic_name", "generic", "drug_name", "drug", "medicine", "articles"].includes(h)
        ),
        dosage: normalized.findIndex((h) =>
          ["dosage_or_size", "dosage", "dosage_form", "size", "strength", "specification"].includes(h)
        ),
        brand: normalized.findIndex((h) => ["brand", "brand_name"].includes(h)),
        balance: normalized.findIndex((h) =>
          h.startsWith("balance") || ["quantity", "qty", "stock", "on_hand", "actual_balance"].includes(h)
        ),
        dohSrp: normalized.findIndex((h) =>
          ["doh_srp_php", "doh_srp", "srp", "doh_price"].includes(h)
        ),
        dpri: normalized.findIndex((h) =>
          ["dpri_php", "dpri", "reference_price", "cost", "unit_cost"].includes(h)
        ),
        bizbox: normalized.findIndex((h) =>
          ["bizbox_price_php", "bizbox_price", "hospital_price", "price", "selling_price"].includes(h)
        ),
        affiliated: normalized.findIndex((h) =>
          ["affiliated_pharmacy_price_php", "affiliated_price", "retail_price"].includes(h)
        ),
        matchStatus: normalized.findIndex((h) => ["match_status", "status"].includes(h)),
        priceListItem: normalized.findIndex((h) => ["price_list_item", "matched_item"].includes(h)),
        sourceSheet: normalized.findIndex((h) => ["source_sheet", "sheet"].includes(h)),
        lot: normalized.findIndex((h) =>
          ["lot_number", "lot_no", "lot", "batch_number", "batch_no", "batch"].includes(h)
        ),
        expiry: normalized.findIndex((h) =>
          ["expiry_date", "expiry", "exp_date", "expiration"].includes(h)
        ),
        notes: normalized.findIndex((h) => ["notes", "remarks", "comment"].includes(h)),
      };
      break;
    }
  }

  if (colMap && headerRowIndex !== -1) {
    // ── Structured Header-Based Parser (Integrated inventory & price lists) ──
    for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0 || !row.some((cell) => cell !== null && cell !== undefined && cell !== "")) {
        continue;
      }

      const itemVal = colMap.item !== -1 && row[colMap.item] !== undefined && row[colMap.item] !== null
        ? String(row[colMap.item]).trim()
        : "";
      if (!itemVal) continue;

      let catVal = colMap.category !== -1 && row[colMap.category] ? String(row[colMap.category]).trim() : currentCategory;
      if (!catVal) catVal = currentCategory;
      const normalizedCat = catVal.toUpperCase();
      currentCategory = normalizedCat;
      categoriesFound.add(normalizedCat);

      const dosageForm = colMap.dosage !== -1 && row[colMap.dosage] !== undefined && row[colMap.dosage] !== null
        ? String(row[colMap.dosage]).trim()
        : null;

      const brandRaw = colMap.brand !== -1 && row[colMap.brand] !== undefined && row[colMap.brand] !== null
        ? String(row[colMap.brand]).trim()
        : null;
      const cleanBrand = brandRaw && !/^(N\/A|GENERIC|NONE|-)$/i.test(brandRaw) ? brandRaw : null;

      let effectiveQuantity = 0;
      if (colMap.balance !== -1 && row[colMap.balance] !== undefined && row[colMap.balance] !== null && row[colMap.balance] !== "") {
        const rawBal = row[colMap.balance];
        const numBal = typeof rawBal === "number" ? rawBal : parseFloat(String(rawBal).replace(/,/g, ""));
        if (!isNaN(numBal) && numBal > 0) {
          effectiveQuantity = numBal;
        }
      }

      const parsePrice = (idx: number): number | null => {
        if (idx === -1 || row[idx] === null || row[idx] === undefined || row[idx] === "") return null;
        const val = typeof row[idx] === "number" ? row[idx] : parseFloat(String(row[idx]).replace(/,/g, ""));
        return !isNaN(val) && val >= 0 ? val : null;
      };

      const dohSrpPhp = parsePrice(colMap.dohSrp);
      const dpriPhp = parsePrice(colMap.dpri);
      const bizboxPricePhp = parsePrice(colMap.bizbox);
      const affiliatedPharmacyPricePhp = parsePrice(colMap.affiliated);

      const sellingPrice = bizboxPricePhp ?? affiliatedPharmacyPricePhp ?? dohSrpPhp ?? 0;
      const unitCost = dpriPhp ?? dohSrpPhp ?? 0;

      const rawExp = colMap.expiry !== -1 ? row[colMap.expiry] : null;
      const expiryDateNormalized = normalizePharmacyExpiryDate(rawExp);
      const lotNo = colMap.lot !== -1 && row[colMap.lot] !== undefined && row[colMap.lot] !== null
        ? String(row[colMap.lot]).trim()
        : null;

      const matchStatus = colMap.matchStatus !== -1 && row[colMap.matchStatus] ? String(row[colMap.matchStatus]).trim() : null;
      const priceListItem = colMap.priceListItem !== -1 && row[colMap.priceListItem] ? String(row[colMap.priceListItem]).trim() : null;
      const rawNotes = colMap.notes !== -1 && row[colMap.notes] ? String(row[colMap.notes]).trim() : null;

      const unitOfMeasure = inferPharmacyUnitOfMeasure(dosageForm, itemVal, normalizedCat);
      const itemName = dosageForm ? `${itemVal} (${dosageForm})` : itemVal;

      items.push({
        category: normalizedCat,
        genericName: itemVal,
        dosageForm: dosageForm || null,
        brandName: cleanBrand,
        itemName,
        unitOfMeasure,
        expiryDateRaw: rawExp !== null && rawExp !== undefined ? String(rawExp).trim() : null,
        expiryDateNormalized,
        lotNumber: lotNo && !/^(N\/A|NONE|-)$/i.test(lotNo) ? lotNo : null,
        dateDelivered: null,
        stocksReceived: null,
        totalStocks: null,
        balanceSept: null,
        qtyDispensed: null,
        actualBalance: effectiveQuantity,
        effectiveQuantity,
        sku: generatePharmacySku(normalizedCat, itemVal, dosageForm),
        notes: rawNotes || (cleanBrand ? `Brand: ${cleanBrand}` : null),
        dohSrpPhp,
        dpriPhp,
        bizboxPricePhp,
        affiliatedPharmacyPricePhp,
        unitCost,
        sellingPrice,
        matchStatus,
        priceListItem,
      });
    }
  } else {
    // ── Positional Sheet Parser (Weekly pharmacy spreadsheets without header rows) ──
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0 || !row.some((cell) => cell !== null && cell !== undefined && cell !== "")) {
        continue;
      }

      const col0 = String(row[0] || "").trim();

      // Skip title lines and column headers
      if (
        col0.toUpperCase().includes("PHARMACY DEPARTMENT") ||
        col0.toUpperCase().includes("WEEKLY MEDICINES") ||
        col0.toUpperCase().includes("AS OF OCTOBER") ||
        col0.toUpperCase().includes("AS OF ") ||
        col0.toUpperCase().includes("LIST OF AVAILABLE")
      ) {
        continue;
      }

      if (
        col0.toUpperCase() === "GENERIC NAME" ||
        col0.toUpperCase() === "ARTICLES" ||
        col0.toUpperCase() === "DRUGS/MEDICINES" ||
        col0.toUpperCase() === "MEDICINES" ||
        col0.toUpperCase() === "DESCRIPTION"
      ) {
        continue;
      }

      // Check if this is a section header (only 1 column filled or starts section)
      const filledCells = row.filter((c) => c !== null && c !== undefined && c !== "");
      const isSectionHeader =
        filledCells.length === 1 &&
        /^(MEDICINES|DANGEROUS DRUGS|ANESTHESIA MEDICINES|FAST MOVING INTRAVENOUS FLUIDS|SUTURES|MEDICAL SUPPLIES|NEAR EXPIRY MEDICINES|SUPPLIES|FLUIDS|ANESTHETICS|OR SUPPLIES)/i.test(
          col0.replace(/^[0-9.\s]+/, "")
        );

      if (isSectionHeader) {
        currentCategory = col0.replace(/^[0-9.\s]+/, "").trim();
        categoriesFound.add(currentCategory);
        continue;
      }

      // Extract columns according to sheet structure
      let genericName = col0;
      let dosageForm = row[1] ? String(row[1]).trim() : null;
      let brandName = row[2] ? String(row[2]).trim() : null;

      // Handle continuation lot rows (where generic name is blank but brand / expiry / lot is present)
      if (!genericName && (brandName || row[3] || row[4] || row[6] || row[10])) {
        genericName = lastGenericName;
        if (!dosageForm) dosageForm = lastDosageForm;
      } else if (genericName) {
        lastGenericName = genericName;
        lastDosageForm = dosageForm || "";
      }

      if (!genericName) continue;

      const rawExp = row[3];
      const lotNo = row[4] !== undefined && row[4] !== null ? String(row[4]).trim() : null;
      const dateDelivered = normalizeDeliveryDate(row[5]);
      const stocksReceived = typeof row[6] === "number" ? row[6] : row[6] ? parseFloat(row[6]) : null;
      const totalStocks = typeof row[7] === "number" ? row[7] : row[7] ? parseFloat(row[7]) : null;
      const balanceSept = typeof row[8] === "number" ? row[8] : row[8] ? parseFloat(row[8]) : null;
      const qtyDispensed = typeof row[9] === "number" ? row[9] : row[9] ? parseFloat(row[9]) : null;
      const actualBalance = typeof row[10] === "number" ? row[10] : row[10] ? parseFloat(row[10]) : null;

      // Determine effective stock quantity to import
      let effectiveQuantity = 0;
      if (actualBalance !== null && !isNaN(actualBalance) && actualBalance >= 0) {
        effectiveQuantity = actualBalance;
      } else if (totalStocks !== null && !isNaN(totalStocks) && totalStocks >= 0) {
        effectiveQuantity = totalStocks;
      } else if (stocksReceived !== null && !isNaN(stocksReceived) && stocksReceived >= 0) {
        effectiveQuantity = stocksReceived;
      }

      const expiryDateNormalized = normalizePharmacyExpiryDate(rawExp);
      const unitOfMeasure = inferPharmacyUnitOfMeasure(dosageForm, genericName, currentCategory);
      const cleanBrand = brandName && !/^(N\/A|GENERIC|NONE|-)$/i.test(brandName) ? brandName : null;

      const itemName = dosageForm
        ? `${genericName.trim()} (${dosageForm.trim()})`
        : genericName.trim();

      categoriesFound.add(currentCategory);

      items.push({
        category: currentCategory,
        genericName: genericName.trim(),
        dosageForm: dosageForm ? dosageForm.trim() : null,
        brandName: cleanBrand,
        itemName,
        unitOfMeasure,
        expiryDateRaw: rawExp !== null && rawExp !== undefined ? String(rawExp).trim() : null,
        expiryDateNormalized,
        lotNumber: lotNo && !/^(N\/A|NONE|-)$/i.test(lotNo) ? lotNo : null,
        dateDelivered,
        stocksReceived: stocksReceived !== null && !isNaN(stocksReceived) ? stocksReceived : null,
        totalStocks: totalStocks !== null && !isNaN(totalStocks) ? totalStocks : null,
        balanceSept: balanceSept !== null && !isNaN(balanceSept) ? balanceSept : null,
        qtyDispensed: qtyDispensed !== null && !isNaN(qtyDispensed) ? qtyDispensed : null,
        actualBalance: actualBalance !== null && !isNaN(actualBalance) ? actualBalance : null,
        effectiveQuantity,
        sku: generatePharmacySku(currentCategory, genericName, dosageForm),
        notes: cleanBrand ? `Brand: ${cleanBrand}` : null,
      });
    }
  }

  const datedCount = items.filter((i) => Boolean(i.expiryDateNormalized)).length;
  const undatedCount = items.length - datedCount;
  const withStockCount = items.filter((i) => i.effectiveQuantity > 0).length;
  const zeroStockCount = items.length - withStockCount;

  return {
    sheetName,
    sheetsAvailable,
    items,
    totalParsed: items.length,
    categoriesFound: Array.from(categoriesFound),
    datedCount,
    undatedCount,
    withStockCount,
    zeroStockCount,
    errors,
  };
}
