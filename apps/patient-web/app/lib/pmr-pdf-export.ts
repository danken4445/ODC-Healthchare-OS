import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { PmrPageSize } from "@odyssey/types";

export interface PmrPdfExportOptions {
  filename?: string;
  pageSize?: PmrPageSize;
}

/**
 * Renders the visible PMR Document DOM element into a crisp, multi-page PDF document
 * and triggers a direct browser download.
 */
export async function exportPmrDocumentToPdf(
  element: HTMLElement,
  options: PmrPdfExportOptions = {}
): Promise<void> {
  const pageSize = options.pageSize ?? "A4";
  const rawFilename = options.filename ?? "Patient-Medical-Record";
  const filename = rawFilename.endsWith(".pdf") ? rawFilename : `${rawFilename}.pdf`;

  // 1. Render DOM element to canvas at high resolution
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth,
  });

  // Dimensions in millimeters
  const pdfWidth = pageSize === "Letter" ? 215.9 : 210;
  const pdfHeight = pageSize === "Letter" ? 279.4 : 297;

  // Pixel height corresponding to one PDF page slice
  const pageHeightPx = Math.floor((canvas.width * pdfHeight) / pdfWidth);
  const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: pageSize === "Letter" ? "letter" : "a4",
    compress: true,
  });

  // 2. Slice canvas into exact page-sized canvases and add to PDF
  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      pdf.addPage();
    }

    const sourceY = page * pageHeightPx;
    const sliceHeight = Math.min(pageHeightPx, canvas.height - sourceY);

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = pageHeightPx;

    const ctx = sliceCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );
    }

    const pageImgData = sliceCanvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(pageImgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
  }

  // 3. Trigger native browser file download
  pdf.save(filename);
}
