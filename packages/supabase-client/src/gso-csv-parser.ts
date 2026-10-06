import type { GsoCsvParseResult, GsoCsvRow } from "@odyssey/types";

/**
 * Normalizes varied human and spreadsheet date formats found in GSO inventory exports.
 * Expiry date is strictly optional; blank, invalid, or absent dates safely return null.
 *
 * Supported formats:
 * - MM/YYYY (e.g. "7/2027", "08/2026") -> end of month (e.g. "2027-07-31")
 * - MM/DD/YY (e.g. "11/19/26") -> 2026-11-19
 * - MM/DD/YYYY (e.g. "9/14/2029") -> 2029-09-14
 * - "SEPT. 2027" / "MARCH 2027" -> end of month (e.g. "2027-09-30")
 * - "AUG. 5, 2027" -> 2027-08-05
 * - YYYY (e.g. "2028") -> end of year (e.g. "2028-12-31")
 */
export function normalizeGsoExpiryDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!trimmed || /^(none|n\/a|na|-|null)$/i.test(trimmed)) return null;

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

  // Month Name + Day + Year: e.g. "AUG. 5, 2027" or "AUG 5 2027"
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

  // Named Month + Year: e.g. "SEPT. 2027", "MARCH 2027"
  const nameYear = trimmed.match(/^([a-zA-Z.]+)\s+(\d{4})$/);
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
 * Splits a CSV line handling quotes and commas accurately.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Checks whether a row is a category section banner.
 */
function isCategoryBanner(tokens: string[]): string | null {
  const nonEmpty = tokens.filter(Boolean);
  if (nonEmpty.length === 0) return null;

  const firstToken = (tokens[1] || tokens[0] || "").toUpperCase().trim();
  const knownCategories = [
    "OFFICE SUPPLIES",
    "OFFICE SUPPLY",
    "GSO MEDICAL SUPPLIES",
    "MEDICAL SUPPLIES",
    "LAUNDRY & JANITORIAL SUPPLIES",
    "JANITORIAL SUPPLIES",
    "MEDICAL EQUIPMENTS",
    "MEDICAL EQUIPMENT",
    "ICT, OFFICE SUPPLIES",
    "ICT OFFICE SUPPLIES",
    "PCSO",
    "DOH",
    "DOH MEDICAL SUPPLIES/EQUIPMENT",
    "DRUGS AND MEDICINES",
  ];

  // Check exact match first
  for (const cat of knownCategories) {
    if (firstToken === cat) {
      return cat;
    }
  }

  // Then check longest substring match if only one non-empty token
  if (nonEmpty.length === 1) {
    const sorted = [...knownCategories].sort((a, b) => b.length - a.length);
    for (const cat of sorted) {
      if (firstToken.includes(cat)) {
        return cat;
      }
    }
  }

  return null;
}

/**
 * Generates an automatic SKU from category and description.
 */
function generateSku(category: string, description: string): string {
  const catPrefix = category.slice(0, 3).toUpperCase();
  const descSlug = description
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `${catPrefix}-${descSlug}`;
}

/**
 * Parses a GSO multi-section inventory CSV document.
 * Expiry dates are optional and converted to ISO YYYY-MM-DD when present.
 */
export function parseGsoInventoryCsv(csvContent: string): GsoCsvParseResult {
  const lines = csvContent.split(/\r?\n/);
  const items: GsoCsvRow[] = [];
  const categoriesFound = new Set<string>();
  const errors: Array<{ line: number; message: string }> = [];

  let currentCategory = "General Supplies";
  let datedCount = 0;
  let undatedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const tokens = parseCsvLine(rawLine);
    const nonEmptyTokens = tokens.filter((t) => t.length > 0);

    // Skip empty lines or pure commas
    if (nonEmptyTokens.length === 0) continue;

    // Skip page markers (e.g., "Page 3", "PAGE 11", pure numbers)
    const combined = nonEmptyTokens.join(" ").toLowerCase();
    if (/^page\s+\d+/i.test(combined) || /^\d+$/.test(combined.trim())) {
      continue;
    }

    // Check for category header banner
    const detectedCategory = isCategoryBanner(tokens);
    if (detectedCategory) {
      currentCategory = detectedCategory;
      categoriesFound.add(currentCategory);
      continue;
    }

    // Skip column headers
    const t0 = (tokens[0] || "").toUpperCase();
    const t1 = (tokens[1] || "").toUpperCase();
    if (
      t0 === "DESCRIPTION" ||
      t1 === "DESCRIPTION" ||
      t0 === "GSO" ||
      t1 === "GSO"
    ) {
      continue;
    }

    // Extract item fields:
    // In GSO spreadsheets, column 0 is usually blank, column 1 is DESCRIPTION
    let description = tokens[1] || tokens[0] || "";
    let expiryRaw: string | null = null;
    let unitOfMeasure = "";
    let quantity: number | null = null;

    if (tokens[1] && tokens[1].length > 0) {
      description = tokens[1];
      // Column 2: EXPIRY or UNIT
      // If tokens[2] looks like a unit (PCS, ROLLS, etc.) and tokens[3] is empty, then expiry was omitted
      const isCol2Unit = /^(PCS|ROLLS|REAMS|BOXES|PACKS|GAL|BOTS|TUBES|SACHET|UNITS|UNIT|CAN|SET|PAIR|PC|BOT|GALS)$/i.test(
        tokens[2] || ""
      );

      if (isCol2Unit) {
        unitOfMeasure = tokens[2];
        quantity = tokens[3] ? parseFloat(tokens[3]) || null : null;
      } else {
        expiryRaw = tokens[2] || null;
        unitOfMeasure = tokens[3] || tokens[4] || "piece";
        quantity = tokens[4] ? parseFloat(tokens[4]) || null : null;
      }
    } else {
      description = tokens[0];
      unitOfMeasure = tokens[2] || "piece";
    }

    // Clean up description
    description = description.replace(/^["']|["']$/g, "").trim();
    if (!description || description.length < 2) continue;

    // Check for trailing annotation in other columns (e.g. "to be checked")
    const extraNotes = tokens
      .slice(4)
      .filter((t) => t && !/^\d+$/.test(t))
      .join("; ");

    const normalizedExpiry = normalizeGsoExpiryDate(expiryRaw);
    if (normalizedExpiry) {
      datedCount++;
    } else {
      undatedCount++;
    }

    categoriesFound.add(currentCategory);

    items.push({
      category: currentCategory,
      description,
      expiryDateRaw: expiryRaw,
      expiryDateNormalized: normalizedExpiry,
      unitOfMeasure: unitOfMeasure ? unitOfMeasure.toLowerCase() : "piece",
      quantity: quantity && !isNaN(quantity) ? quantity : null,
      sku: generateSku(currentCategory, description),
      notes: extraNotes || null,
    });
  }

  return {
    items,
    totalParsed: items.length,
    categoriesFound: Array.from(categoriesFound),
    datedCount,
    undatedCount,
    errors,
  };
}
