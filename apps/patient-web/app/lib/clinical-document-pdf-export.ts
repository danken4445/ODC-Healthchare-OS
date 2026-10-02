import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export interface ClinicalPdfExportOptions {
  filename?: string;
  pageSize?: "A4" | "Letter";
}

/**
 * Renders any clinical document DOM element into a crisp, professional PDF
 * and triggers a native browser download.
 */
export async function exportClinicalDocumentToPdf(
  elementOrId: HTMLElement | string,
  options: ClinicalPdfExportOptions = {}
): Promise<void> {
  const element =
    typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;

  if (!element) {
    console.warn("Target element for PDF export not found:", elementOrId);
    return;
  }

  const pageSize = options.pageSize ?? "A4";
  const rawFilename = options.filename ?? "Clinical-Document";
  const cleanBase = rawFilename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const filename = cleanBase.endsWith(".pdf") ? cleanBase : `${cleanBase}.pdf`;

  // Render DOM element to canvas at high resolution (scale: 2 for 300dpi-equivalent print fidelity)
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth || 794, // 210mm in px at 96dpi
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

  pdf.save(filename);
}
