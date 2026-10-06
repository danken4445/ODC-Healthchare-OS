const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { chromium } = require('@playwright/test');

// Brand Colors (Official ODC Odyssey Healthcare OS Branding)
const BRAND = {
  primary: 'F15A24',        // Vibrant Brand Orange
  primaryHex: '#F15A24',
  primaryDark: 'D93800',    // Burnt Orange / Hotspot
  primaryDarkHex: '#D93800',
  primaryLight: 'FFF4ED',   // Warm Light Orange Tint
  primaryLightHex: '#FFF4ED',
  background: 'F8F9FA',     // Clean Off-white canvas
  backgroundHex: '#F8F9FA',
  card: 'FFFFFF',
  cardHex: '#FFFFFF',
  foreground: '16222F',     // Deep Charcoal / Dark Navy
  foregroundHex: '#16222F',
  mutedForeground: '5A6B78',// Slate Charcoal
  mutedForegroundHex: '#5A6B78',
  border: 'E2E8F0',         // Clean Slate Border
  borderHex: '#E2E8F0',
  fontFace: 'Segoe UI'
};

const OUTPUT_DIR = path.join(__dirname, 'presentation_assets');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. Generate High-Res SVG/PNG Assets via Playwright
async function generateGraphicAssets() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 });

  async function captureSvg(html, filename) {
    await page.setContent(html);
    const svgEl = await page.$('svg');
    await svgEl.screenshot({ path: path.join(OUTPUT_DIR, filename), omitBackground: true });
  }

  // 1A. Patient Icon (Slide 2)
  const patientIconHtml = `
    <!DOCTYPE html><html><body style="margin:0;padding:10px;background:transparent;display:inline-block;">
      <svg width="120" height="120" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="30" fill="#FFF4ED" stroke="#E2E8F0" stroke-width="1.5" />
        <circle cx="32" cy="22" r="8" fill="none" stroke="#F15A24" stroke-width="2.6" stroke-linecap="round" />
        <path d="M18 46 C18 36.5 24 33.5 32 33.5 C40 33.5 46 36.5 46 46" fill="none" stroke="#F15A24" stroke-width="2.6" stroke-linecap="round" />
        <circle cx="45" cy="19" r="7.5" fill="#F15A24" />
        <path d="M42 19 C42 17.5 43.5 16.5 45 17.5 C46.5 16.5 48 17.5 48 19 C48 20.8 45 22.8 45 22.8 C45 22.8 42 20.8 42 19 Z" fill="#FFFFFF" />
      </svg>
    </body></html>
  `;
  await captureSvg(patientIconHtml, 'icon_patient.png');

  // 1B. Provider Icon (Slide 2)
  const providerIconHtml = `
    <!DOCTYPE html><html><body style="margin:0;padding:10px;background:transparent;display:inline-block;">
      <svg width="120" height="120" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="30" fill="#FFF4ED" stroke="#E2E8F0" stroke-width="1.5" />
        <path d="M21 19 L21 29 C21 35 25.8 39.5 32 39.5 C38.2 39.5 43 35 43 29 L43 19" fill="none" stroke="#F15A24" stroke-width="2.6" stroke-linecap="round" />
        <path d="M32 39.5 L32 44.5 C32 47.5 35 49 37.5 49 L40 49" fill="none" stroke="#F15A24" stroke-width="2.6" stroke-linecap="round" />
        <circle cx="43" cy="49" r="4" fill="#F15A24" />
        <circle cx="21" cy="17.5" r="2.8" fill="#F15A24" />
        <circle cx="43" cy="17.5" r="2.8" fill="#F15A24" />
      </svg>
    </body></html>
  `;
  await captureSvg(providerIconHtml, 'icon_provider.png');

  // 1C. Admin Icon (Slide 2)
  const adminIconHtml = `
    <!DOCTYPE html><html><body style="margin:0;padding:10px;background:transparent;display:inline-block;">
      <svg width="120" height="120" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="30" fill="#FFF4ED" stroke="#E2E8F0" stroke-width="1.5" />
        <path d="M19 45 L19 23 L32 16 L45 23 L45 45 Z" fill="none" stroke="#F15A24" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />
        <line x1="25" y1="39" x2="25" y2="34" stroke="#F15A24" stroke-width="2.4" stroke-linecap="round" />
        <line x1="32" y1="39" x2="32" y2="27" stroke="#F15A24" stroke-width="2.4" stroke-linecap="round" />
        <line x1="39" y1="39" x2="39" y2="31" stroke="#F15A24" stroke-width="2.4" stroke-linecap="round" />
      </svg>
    </body></html>
  `;
  await captureSvg(adminIconHtml, 'icon_admin.png');

  // 1D. 2D Musculoskeletal Figure (Slide 3)
  const frontRegions = [
    { code: "head", display: "Head", d: "M116 22 C116 4 164 4 164 22 L160 61 C156 78 124 78 120 61 Z" },
    { code: "neck", display: "Neck", d: "M128 72 L152 72 L157 99 L123 99 Z" },
    { code: "right-shoulder", display: "Right shoulder", d: "M122 98 C100 94 81 103 73 120 L82 143 L116 132 Z" },
    { code: "left-shoulder", display: "Left shoulder", d: "M158 98 C180 94 199 103 207 120 L198 143 L164 132 Z" },
    { code: "chest", display: "Chest", d: "M117 105 C128 99 152 99 163 105 L174 174 C157 184 123 184 106 174 Z" },
    { code: "abdomen", display: "Abdomen", d: "M108 178 C124 185 156 185 172 178 L168 251 C153 260 127 260 112 251 Z" },
    { code: "pelvis", display: "Pelvis", d: "M111 255 C128 263 152 263 169 255 L178 295 C160 310 120 310 102 295 Z" },
    { code: "right-upper-arm", display: "Right upper arm", d: "M72 124 C62 135 57 165 59 204 L82 208 L94 143 Z" },
    { code: "left-upper-arm", display: "Left upper arm", d: "M208 124 C218 135 223 165 221 204 L198 208 L186 143 Z" },
    { code: "right-elbow", display: "Right elbow", d: "M58 207 L82 210 L80 238 L55 236 Z" },
    { code: "left-elbow", display: "Left elbow", d: "M222 207 L198 210 L200 238 L225 236 Z" },
    { code: "right-forearm-hand", display: "Right forearm and hand", d: "M55 240 L79 241 L72 318 L61 356 L42 350 L51 313 Z" },
    { code: "left-forearm-hand", display: "Left forearm and hand", d: "M225 240 L201 241 L208 318 L219 356 L238 350 L229 313 Z" },
    { code: "right-hip", display: "Right hip", d: "M103 297 C113 305 124 309 137 308 L133 343 L101 342 Z" },
    { code: "left-hip", display: "Left hip", d: "M177 297 C167 305 156 309 143 308 L147 343 L179 342 Z" },
    { code: "right-thigh", display: "Right thigh", d: "M101 346 L133 347 L129 426 L99 426 Z" },
    { code: "left-thigh", display: "Left thigh", d: "M179 346 L147 347 L151 426 L181 426 Z" },
    { code: "right-knee", display: "Right knee", d: "M99 430 L129 430 L127 460 L98 460 Z" },
    { code: "left-knee", display: "Left knee", d: "M181 430 L151 430 L153 460 L182 460 Z" },
    { code: "right-lower-leg-foot", display: "Right lower leg and foot", d: "M98 464 L127 464 L123 535 L139 548 L88 548 L100 523 Z" },
    { code: "left-lower-leg-foot", display: "Left lower leg and foot", d: "M182 464 L153 464 L157 535 L141 548 L192 548 L180 523 Z" }
  ];

  const bodyHtml = `
    <!DOCTYPE html><html><body style="margin:0;padding:12px;background:transparent;display:inline-block;">
      <svg width="340" height="540" viewBox="0 0 280 560" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#16222F" flood-opacity="0.12" />
          </filter>
        </defs>
        <g stroke-linecap="round" stroke-linejoin="round">
          ${frontRegions.map(r => {
            const isHighlighted = r.code === 'right-shoulder';
            const fill = isHighlighted ? '#F15A24' : '#EDF2F4';
            const stroke = isHighlighted ? '#D93800' : '#CED8DB';
            const strokeWidth = isHighlighted ? '2.5' : '1.5';
            return `<path d="${r.d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
          }).join('\n')}
        </g>
        <circle cx="95" cy="118" r="14" fill="none" stroke="#F15A24" stroke-width="2" stroke-dasharray="3 3" opacity="0.9" />
        <circle cx="95" cy="118" r="5" fill="#F15A24" />
        <circle cx="95" cy="118" r="2" fill="#FFFFFF" />
        <line x1="95" y1="118" x2="35" y2="72" stroke="#F15A24" stroke-width="2" stroke-linecap="round" />
        <g filter="url(#cardShadow)">
          <rect x="2" y="44" width="136" height="34" rx="17" fill="#F15A24" />
          <circle cx="18" cy="61" r="6" fill="#FFFFFF" />
          <path d="M16 61 L18 63 L21 59" stroke="#F15A24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          <text x="32" y="65" font-size="10.5" font-weight="700" fill="#FFFFFF" font-family="'Segoe UI', Arial, sans-serif" letter-spacing="0.5">RIGHT SHOULDER</text>
        </g>
      </svg>
    </body></html>
  `;
  await captureSvg(bodyHtml, 'musculoskeletal_figure.png');

  // 1E. Slide 4 Flow Diagram Visual
  const flowDiagramHtml = `
    <!DOCTYPE html><html><body style="margin:0;padding:12px;background:transparent;display:inline-block;">
      <svg width="1020" height="150" viewBox="0 0 1020 150" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#16222F" flood-opacity="0.08" />
          </filter>
        </defs>
        <g filter="url(#softShadow)">
          <rect x="10" y="10" width="285" height="125" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />
          <circle cx="52" cy="55" r="23" fill="#FFF4ED" />
          <rect x="41" y="44" width="22" height="22" rx="3" fill="none" stroke="#F15A24" stroke-width="2" />
          <line x1="45" y1="49" x2="45" y2="61" stroke="#F15A24" stroke-width="2" />
          <line x1="49" y1="49" x2="49" y2="61" stroke="#F15A24" stroke-width="1.2" />
          <line x1="53" y1="49" x2="53" y2="61" stroke="#F15A24" stroke-width="2.4" />
          <line x1="57" y1="49" x2="57" y2="61" stroke="#F15A24" stroke-width="1.4" />
          <text x="88" y="46" font-size="11" font-weight="700" fill="#F15A24" font-family="'Segoe UI', sans-serif" letter-spacing="1.2">STEP 01</text>
          <text x="88" y="72" font-size="16" font-weight="700" fill="#16222F" font-family="'Segoe UI', sans-serif">Tag item to patient</text>
          <text x="88" y="96" font-size="12.5" fill="#5A6B78" font-family="'Segoe UI', sans-serif">Bedside scan &amp; assignment</text>
        </g>
        <g>
          <circle cx="322" cy="72" r="16" fill="#FFF4ED" stroke="#E2E8F0" stroke-width="1" />
          <path d="M318 72 L327 72 M323 67 L328 72 L323 77" fill="none" stroke="#F15A24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </g>
        <g filter="url(#softShadow)">
          <rect x="348" y="10" width="295" height="125" rx="12" fill="#FFFFFF" stroke="#F15A24" stroke-width="2" />
          <circle cx="390" cy="55" r="23" fill="#FFF4ED" />
          <path d="M378 48 L390 42 L402 48 L390 54 Z" fill="none" stroke="#F15A24" stroke-width="2" stroke-linejoin="round" />
          <path d="M378 48 L378 60 L390 66 L390 54" fill="none" stroke="#F15A24" stroke-width="2" stroke-linejoin="round" />
          <path d="M402 48 L402 60 L390 66" fill="none" stroke="#F15A24" stroke-width="2" stroke-linejoin="round" />
          <text x="426" y="46" font-size="11" font-weight="700" fill="#F15A24" font-family="'Segoe UI', sans-serif" letter-spacing="1.2">STEP 02 (FEFO)</text>
          <text x="426" y="72" font-size="16" font-weight="700" fill="#16222F" font-family="'Segoe UI', sans-serif">Stock deducted</text>
          <text x="426" y="96" font-size="12.5" fill="#5A6B78" font-family="'Segoe UI', sans-serif">Earliest expiry first</text>
        </g>
        <g>
          <circle cx="670" cy="72" r="16" fill="#FFF4ED" stroke="#E2E8F0" stroke-width="1" />
          <path d="M666 72 L675 72 M671 67 L676 72 L671 77" fill="none" stroke="#F15A24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </g>
        <g filter="url(#softShadow)">
          <rect x="696" y="10" width="314" height="125" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />
          <circle cx="738" cy="55" r="23" fill="#FFF4ED" />
          <rect x="728" y="43" width="20" height="24" rx="2" fill="none" stroke="#F15A24" stroke-width="2" />
          <line x1="733" y1="49" x2="743" y2="49" stroke="#F15A24" stroke-width="1.8" />
          <line x1="733" y1="54" x2="743" y2="54" stroke="#F15A24" stroke-width="1.8" />
          <path d="M733 60 L736 63 L743 56" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <text x="774" y="46" font-size="11" font-weight="700" fill="#F15A24" font-family="'Segoe UI', sans-serif" letter-spacing="1.2">STEP 03</text>
          <text x="774" y="72" font-size="15.5" font-weight="700" fill="#16222F" font-family="'Segoe UI', sans-serif">Statement of Account (SOA)</text>
          <text x="774" y="96" font-size="12.5" fill="#5A6B78" font-family="'Segoe UI', sans-serif">PhilHealth subledger post</text>
        </g>
      </svg>
    </body></html>
  `;
  await captureSvg(flowDiagramHtml, 'flow_diagram.png');

  // 1F. Philippine Regional Choropleth Map (Slide 5 Visual)
  const geojsonPath = path.join(__dirname, '../apps/admin-web/public/maps/philippines-regions.json');
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const REGIONAL_RATES = [2.2, 6.8, 16.4, 9.1, 4.9, 10.6, 18.1, 3.7, 7.2, 12.4, 13.8, 22.6, 2.8, 5.4, 8.7, 11.3, 4.1, 17.2];

  function collectRings(value, rings = []) {
    if (!Array.isArray(value)) return rings;
    const isRing = value.length > 2 && value.every(point => Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number');
    if (isRing) rings.push(value);
    else value.forEach(child => collectRings(child, rings));
    return rings;
  }

  function flattenPairs(value, pairs = []) {
    if (!Array.isArray(value)) return pairs;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') pairs.push([value[0], value[1]]);
    else value.forEach(child => flattenPairs(child, pairs));
    return pairs;
  }

  const allPairs = geojson.features.flatMap(f => flattenPairs(f.geometry.coordinates));
  const minX = Math.min(...allPairs.map(([x]) => x));
  const maxX = Math.max(...allPairs.map(([x]) => x));
  const minY = Math.min(...allPairs.map(([, y]) => y));
  const maxY = Math.max(...allPairs.map(([, y]) => y));

  const mapW = 460;
  const mapH = 560;
  const mapScale = Math.min((mapW - 30) / (maxX - minX), (mapH - 30) / (maxY - minY));
  const mapOffsetX = (mapW - (maxX - minX) * mapScale) / 2;
  const mapOffsetY = (mapH - (maxY - minY) * mapScale) / 2;

  function pathForFeature(feature) {
    return collectRings(feature.geometry.coordinates).map(points => {
      return points.map(([x, y], idx) => {
        const px = (x - minX) * mapScale + mapOffsetX;
        const py = mapH - ((y - minY) * mapScale + mapOffsetY);
        return `${idx === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
      }).join(' ') + ' Z';
    }).join(' ');
  }

  function getChoroplethColor(rate) {
    if (rate > 15) return '#D93800'; // Hotspot
    if (rate >= 10) return '#F15A24'; // High (Brand Orange)
    if (rate >= 5) return '#FFA071'; // Moderate
    return '#FFDEC9'; // Low
  }

  const svgMapPaths = geojson.features.map((feature, idx) => {
    const rate = REGIONAL_RATES[idx % REGIONAL_RATES.length];
    const fill = getChoroplethColor(rate);
    const d = pathForFeature(feature);
    return `<path d="${d}" fill="${fill}" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" />`;
  }).join('\n');

  const choroplethCardHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 10px; background: transparent; font-family: 'Segoe UI', Arial, sans-serif; display: inline-block; }
        .map-card {
          width: 480px;
          height: 560px;
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 16px;
          position: relative;
          box-shadow: 0 10px 30px rgba(22, 34, 47, 0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          overflow: hidden;
        }
        .map-header {
          width: 100%;
          box-sizing: border-box;
          padding: 14px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #EDF2F7;
        }
        .header-title {
          font-size: 14px;
          font-weight: 700;
          color: #16222F;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          background: #F15A24;
          border-radius: 50%;
        }
        .badge-live {
          padding: 4px 12px;
          background: #FFF4ED;
          border: 1px solid #F15A24;
          border-radius: 12px;
          font-size: 10.5px;
          font-weight: 700;
          color: #F15A24;
        }
        .meta-stats {
          position: absolute;
          top: 60px;
          right: 20px;
          font-size: 11px;
          font-weight: 600;
          color: #5A6B78;
          text-align: right;
          background: rgba(255, 255, 255, 0.9);
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid #E2E8F0;
        }
        .meta-stats span {
          color: #F15A24;
          font-weight: 700;
        }
        .legend-box {
          position: absolute;
          bottom: 14px;
          left: 18px;
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 10px;
          color: #5A6B78;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .legend-bar {
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .legend-step {
          width: 20px;
          height: 8px;
          border-radius: 2px;
        }
      </style>
    </head>
    <body>
      <div class="map-card">
        <div class="map-header">
          <div class="header-title">
            <div class="pulse-dot"></div>
            National Disease Surveillance
          </div>
          <div class="badge-live">DOH-PIDSR LIVE</div>
        </div>
        <div class="meta-stats">
          Epi-Week 40 Surveillance<br>
          <span>17 Regions Connected</span>
        </div>
        <svg width="460" height="490" viewBox="0 0 460 560" xmlns="http://www.w3.org/2000/svg">
          ${svgMapPaths}
        </svg>
        <div class="legend-box">
          <span style="font-weight:700; color:#16222F;">Incidence Rate (per 10k)</span>
          <div class="legend-bar">
            <div class="legend-step" style="background:#FFDEC9;"></div>
            <div class="legend-step" style="background:#FFA071;"></div>
            <div class="legend-step" style="background:#F15A24;"></div>
            <div class="legend-step" style="background:#D93800;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:9px;">
            <span>< 5.0</span>
            <span>10.0</span>
            <span>> 15.0</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  await page.setContent(choroplethCardHtml);
  const mapCardEl = await page.$('.map-card');
  await mapCardEl.screenshot({ path: path.join(OUTPUT_DIR, 'choropleth_map.png'), omitBackground: true });

  await browser.close();
  console.log('All graphic assets including Choropleth Map generated cleanly in', OUTPUT_DIR);
}

// 2. Build 5-Slide Deck in PPTXGenJS
async function buildPresentation() {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  function applyStandardGrid(slide, categoryText, headlineText, slideNumStr) {
    slide.background = { color: BRAND.background };

    // Kicker / Category Tracker
    slide.addText(categoryText.toUpperCase(), {
      x: 1.0,
      y: 0.8,
      w: 11.333,
      h: 0.3,
      fontFace: BRAND.fontFace,
      fontSize: 10,
      bold: true,
      color: BRAND.primary,
      charSpacing: 2.0
    });

    // Main Headline (Strictly max 6 words)
    slide.addText(headlineText, {
      x: 1.0,
      y: 1.15,
      w: 11.333,
      h: 0.75,
      fontFace: BRAND.fontFace,
      fontSize: 34,
      bold: true,
      color: BRAND.foreground
    });

    // Divider line above footer
    slide.addShape(pptx.ShapeType.line, {
      x: 1.0,
      y: 6.75,
      w: 11.333,
      h: 0,
      line: { color: BRAND.border, width: 0.75 }
    });

    // Footer left: "ODC • ODYSSEY"
    slide.addText([
      { text: "ODC ", options: { bold: true, color: BRAND.primary } },
      { text: "• ODYSSEY HEALTHCARE OS", options: { bold: false, color: BRAND.mutedForeground } }
    ], {
      x: 1.0,
      y: 6.85,
      w: 5.0,
      h: 0.35,
      fontFace: BRAND.fontFace,
      fontSize: 9.5
    });

    // Footer right: Slide number
    slide.addText(slideNumStr, {
      x: 7.333,
      y: 6.85,
      w: 5.0,
      h: 0.35,
      align: 'right',
      fontFace: BRAND.fontFace,
      fontSize: 9.5,
      color: BRAND.mutedForeground
    });
  }

  // ==========================================
  // SLIDE 1: TITLE (Updated with 3D ODC Brand Logo)
  // ==========================================
  {
    const slide1 = pptx.addSlide();
    slide1.background = { color: BRAND.background };

    // Main Hero Card
    slide1.addShape(pptx.ShapeType.roundRect, {
      x: 1.0,
      y: 1.0,
      w: 11.333,
      h: 5.3,
      rectRadius: 0.15,
      fill: { color: BRAND.card },
      line: { color: BRAND.border, width: 1.25 }
    });

    // Dedicated Logo Card Frame
    slide1.addShape(pptx.ShapeType.roundRect, {
      x: 1.6,
      y: 1.9,
      w: 3.1,
      h: 3.1,
      rectRadius: 0.16,
      fill: { color: 'FFFFFF' },
      line: { color: BRAND.border, width: 1.25 }
    });

    // Authentic 3D ODC Odyssey Brand Logo
    slide1.addImage({
      path: path.join(OUTPUT_DIR, 'odc_logo_3d.png'),
      x: 1.7,
      y: 2.0,
      w: 2.9,
      h: 2.9
    });

    // Category / Kicker
    slide1.addText("PHILIPPINES FEDERATED HEALTH NETWORK", {
      x: 5.1,
      y: 2.1,
      w: 6.8,
      h: 0.3,
      fontFace: BRAND.fontFace,
      fontSize: 10.5,
      bold: true,
      color: BRAND.primary,
      charSpacing: 2.0
    });

    // Title Headline (3 words <= 6 words)
    slide1.addText("Odyssey Healthcare OS", {
      x: 5.05,
      y: 2.45,
      w: 7.0,
      h: 1.1,
      fontFace: BRAND.fontFace,
      fontSize: 44,
      bold: true,
      color: BRAND.foreground
    });

    // Tagline (6 words <= 8 words)
    slide1.addText("One operating system for connected care.", {
      x: 5.1,
      y: 3.75,
      w: 6.8,
      h: 0.6,
      fontFace: BRAND.fontFace,
      fontSize: 20,
      bold: false,
      color: BRAND.mutedForeground
    });

    // Sub-phrase pill (4 words <= 8 words)
    slide1.addShape(pptx.ShapeType.roundRect, {
      x: 5.1,
      y: 4.55,
      w: 4.2,
      h: 0.48,
      rectRadius: 0.24,
      fill: { color: BRAND.primaryLight },
      line: { color: BRAND.primary, width: 1.0 }
    });
    slide1.addText("Production-ready hospital core", {
      x: 5.1,
      y: 4.55,
      w: 4.2,
      h: 0.48,
      align: 'center',
      valign: 'middle',
      fontFace: BRAND.fontFace,
      fontSize: 11,
      bold: true,
      color: BRAND.primary
    });

    // Footer: Odyssey
    slide1.addShape(pptx.ShapeType.line, {
      x: 1.0,
      y: 6.75,
      w: 11.333,
      h: 0,
      line: { color: BRAND.border, width: 0.75 }
    });
    slide1.addText("ODC • ODYSSEY", {
      x: 1.0,
      y: 6.85,
      w: 5.0,
      h: 0.35,
      fontFace: BRAND.fontFace,
      fontSize: 10,
      bold: true,
      color: BRAND.primary
    });

    slide1.addNotes("Odyssey Healthcare OS is a production-grade hospital operating system designed for the Philippine healthcare landscape. It unifies clinical, administrative, and financial operations from day one.");
  }

  // ==========================================
  // SLIDE 2: BUILT FOR EVERY ROLE
  // ==========================================
  {
    const slide2 = pptx.addSlide();
    applyStandardGrid(slide2, "Unified Ecosystem", "Built for every role", "02 / 05");

    const colW = 3.55;
    const gap = 0.34;
    const startX = 1.0;
    const cardY = 2.15;
    const cardH = 4.2;

    const roles = [
      {
        role: "PATIENTS",
        phrase: "booking, portal, teleconsult, QR payments",
        icon: "icon_patient.png"
      },
      {
        role: "PROVIDERS",
        phrase: "queue, SOAP notes, prescriptions, referrals",
        icon: "icon_provider.png"
      },
      {
        role: "ADMINS",
        phrase: "analytics, billing, inventory, HMO claims",
        icon: "icon_admin.png"
      }
    ];

    roles.forEach((r, idx) => {
      const curX = startX + idx * (colW + gap);

      // Card container
      slide2.addShape(pptx.ShapeType.roundRect, {
        x: curX,
        y: cardY,
        w: colW,
        h: cardH,
        rectRadius: 0.14,
        fill: { color: BRAND.card },
        line: { color: BRAND.border, width: 1.25 }
      });

      // Role Icon
      slide2.addImage({
        path: path.join(OUTPUT_DIR, r.icon),
        x: curX + (colW - 1.5) / 2,
        y: cardY + 0.45,
        w: 1.5,
        h: 1.5
      });

      // Role Pill Badge
      slide2.addShape(pptx.ShapeType.roundRect, {
        x: curX + (colW - 1.8) / 2,
        y: cardY + 2.25,
        w: 1.8,
        h: 0.36,
        rectRadius: 0.18,
        fill: { color: BRAND.primaryLight },
        line: { color: BRAND.primary, width: 1.0 }
      });
      slide2.addText(r.role, {
        x: curX + (colW - 1.8) / 2,
        y: cardY + 2.25,
        w: 1.8,
        h: 0.36,
        align: 'center',
        valign: 'middle',
        fontFace: BRAND.fontFace,
        fontSize: 11,
        bold: true,
        color: BRAND.primary
      });

      // Phrase (Max 8 words: 6 words)
      slide2.addText(r.phrase, {
        x: curX + 0.35,
        y: cardY + 2.85,
        w: colW - 0.7,
        h: 1.0,
        align: 'center',
        fontFace: BRAND.fontFace,
        fontSize: 17,
        bold: true,
        color: BRAND.foreground
      });
    });

    slide2.addNotes("Odyssey unifies patient self-service, physician clinical workflows, and administrative operations into a single platform. This eliminates fragmented software silos and duplicate data entry across the facility.");
  }

  // ==========================================
  // SLIDE 3: SMARTER ENCOUNTERS
  // ==========================================
  {
    const slide3 = pptx.addSlide();
    applyStandardGrid(slide3, "Clinical Workflows", "Care that starts with the body", "03 / 05");

    const leftX = 1.0;
    const leftW = 4.4;
    const bodyCardY = 2.15;
    const bodyCardH = 4.2;

    // Left Container: Musculoskeletal Figure
    slide3.addShape(pptx.ShapeType.roundRect, {
      x: leftX,
      y: bodyCardY,
      w: leftW,
      h: bodyCardH,
      rectRadius: 0.14,
      fill: { color: BRAND.card },
      line: { color: BRAND.border, width: 1.25 }
    });

    slide3.addImage({
      path: path.join(OUTPUT_DIR, 'musculoskeletal_figure.png'),
      x: leftX + (leftW - 2.5) / 2,
      y: bodyCardY + 0.2,
      w: 2.5,
      h: 3.8
    });

    // Right side: 3 Phrase Cards
    const rightX = 5.75;
    const rightW = 6.58;
    const phraseCardH = 1.22;
    const phraseGap = 0.27;

    const phrases = [
      {
        badge: "01 • VISUAL CHARTING",
        phrase: "Tap a region, see history, add diagnosis"
      },
      {
        badge: "02 • RAPID DOCUMENTATION",
        phrase: "Simple Mode for fast SOAP notes"
      },
      {
        badge: "03 • CONSULTATION AUDIT",
        phrase: "Auto-tracked encounter time"
      }
    ];

    phrases.forEach((p, idx) => {
      const curY = bodyCardY + idx * (phraseCardH + phraseGap);

      slide3.addShape(pptx.ShapeType.roundRect, {
        x: rightX,
        y: curY,
        w: rightW,
        h: phraseCardH,
        rectRadius: 0.14,
        fill: { color: BRAND.card },
        line: { color: idx === 0 ? BRAND.primary : BRAND.border, width: idx === 0 ? 1.75 : 1.25 }
      });

      slide3.addShape(pptx.ShapeType.roundRect, {
        x: rightX + 0.4,
        y: curY + 0.22,
        w: 2.5,
        h: 0.28,
        rectRadius: 0.14,
        fill: { color: BRAND.primaryLight }
      });
      slide3.addText(p.badge, {
        x: rightX + 0.4,
        y: curY + 0.22,
        w: 2.5,
        h: 0.28,
        align: 'center',
        valign: 'middle',
        fontFace: BRAND.fontFace,
        fontSize: 9.5,
        bold: true,
        color: BRAND.primary
      });

      slide3.addText(p.phrase, {
        x: rightX + 0.4,
        y: curY + 0.58,
        w: rightW - 0.8,
        h: 0.45,
        fontFace: BRAND.fontFace,
        fontSize: 18,
        bold: true,
        color: BRAND.foreground
      });
    });

    slide3.addNotes("Clinicians can visually chart encounters by selecting anatomical regions directly on a digital body map. Odyssey surfaces relevant patient history instantly and accelerates documentation with fast SOAP templates.");
  }

  // ==========================================
  // SLIDE 4: INVENTORY AND BILLING, IN SYNC
  // ==========================================
  {
    const slide4 = pptx.addSlide();
    applyStandardGrid(slide4, "Operations & Finance", "Every item accounted for", "04 / 05");

    // Flow diagram visual across the top
    slide4.addImage({
      path: path.join(OUTPUT_DIR, 'flow_diagram.png'),
      x: 1.0,
      y: 2.15,
      w: 11.333,
      h: 1.75
    });

    // 3 phrase cards across the bottom
    const bottomCardY = 4.25;
    const bottomCardH = 2.1;
    const colW = 3.55;
    const gap = 0.34;

    const opPhrases = [
      {
        badge: "DEPARTMENTAL STOCK",
        phrase: "Real-time stock per department"
      },
      {
        badge: "BATCH DISPENSING",
        phrase: "Expiry alerts"
      },
      {
        badge: "UNIVERSAL HEALTHCARE",
        phrase: "PhilHealth-ready, even for free-service hospitals"
      }
    ];

    opPhrases.forEach((p, idx) => {
      const curX = 1.0 + idx * (colW + gap);

      slide4.addShape(pptx.ShapeType.roundRect, {
        x: curX,
        y: bottomCardY,
        w: colW,
        h: bottomCardH,
        rectRadius: 0.14,
        fill: { color: BRAND.card },
        line: { color: BRAND.border, width: 1.25 }
      });

      slide4.addShape(pptx.ShapeType.roundRect, {
        x: curX + 0.35,
        y: bottomCardY + 0.35,
        w: colW - 0.7,
        h: 0.3,
        rectRadius: 0.15,
        fill: { color: BRAND.primaryLight }
      });
      slide4.addText(p.badge, {
        x: curX + 0.35,
        y: bottomCardY + 0.35,
        w: colW - 0.7,
        h: 0.3,
        align: 'center',
        valign: 'middle',
        fontFace: BRAND.fontFace,
        fontSize: 10,
        bold: true,
        color: BRAND.primary
      });

      slide4.addText(p.phrase, {
        x: curX + 0.35,
        y: bottomCardY + 0.85,
        w: colW - 0.7,
        h: 0.95,
        align: 'center',
        fontFace: BRAND.fontFace,
        fontSize: 17,
        bold: true,
        color: BRAND.foreground
      });
    });

    slide4.addNotes("When clinical staff scan or tag supplies at the bedside, inventory is automatically relieved by earliest expiration date. Charges immediately populate the patient's Statement of Account (SOA) and PhilHealth claims, preventing revenue leakage.");
  }

  // ==========================================
  // SLIDE 5: THE ROADMAP & CHOROPLETH DISEASE TRENDS
  // ==========================================
  {
    const slide5 = pptx.addSlide();
    applyStandardGrid(slide5, "Strategic Roadmap & Surveillance", "From hospital to national network", "05 / 05");

    const leftX = 1.0;
    const leftW = 6.4;
    const cardY = 2.15;

    // Timeline Milestone 1
    slide5.addShape(pptx.ShapeType.roundRect, {
      x: leftX,
      y: cardY,
      w: leftW,
      h: 0.85,
      rectRadius: 0.1,
      fill: { color: BRAND.card },
      line: { color: BRAND.border, width: 1.25 }
    });
    slide5.addShape(pptx.ShapeType.roundRect, {
      x: leftX + 0.25,
      y: cardY + 0.2,
      w: 1.1,
      h: 0.45,
      rectRadius: 0.1,
      fill: { color: BRAND.primaryLight }
    });
    slide5.addText("PHASE 1", {
      x: leftX + 0.25,
      y: cardY + 0.2,
      w: 1.1,
      h: 0.45,
      align: 'center',
      valign: 'middle',
      fontFace: BRAND.fontFace,
      fontSize: 11,
      bold: true,
      color: BRAND.primary
    });
    slide5.addText("Single hospital, production-ready", {
      x: leftX + 1.55,
      y: cardY + 0.2,
      w: leftW - 1.8,
      h: 0.45,
      valign: 'middle',
      fontFace: BRAND.fontFace,
      fontSize: 16.5,
      bold: true,
      color: BRAND.foreground
    });

    // Timeline Milestone 2
    slide5.addShape(pptx.ShapeType.roundRect, {
      x: leftX,
      y: cardY + 1.05,
      w: leftW,
      h: 0.85,
      rectRadius: 0.1,
      fill: { color: BRAND.card },
      line: { color: BRAND.primary, width: 1.75 }
    });
    slide5.addShape(pptx.ShapeType.roundRect, {
      x: leftX + 0.25,
      y: cardY + 1.25,
      w: 1.1,
      h: 0.45,
      rectRadius: 0.1,
      fill: { color: BRAND.primaryLight }
    });
    slide5.addText("PHASE 2", {
      x: leftX + 0.25,
      y: cardY + 1.25,
      w: 1.1,
      h: 0.45,
      align: 'center',
      valign: 'middle',
      fontFace: BRAND.fontFace,
      fontSize: 11,
      bold: true,
      color: BRAND.primary
    });
    slide5.addText("RHUs and clinics join", {
      x: leftX + 1.55,
      y: cardY + 1.25,
      w: leftW - 1.8,
      h: 0.45,
      valign: 'middle',
      fontFace: BRAND.fontFace,
      fontSize: 16.5,
      bold: true,
      color: BRAND.foreground
    });

    // Timeline Milestone 3
    slide5.addShape(pptx.ShapeType.roundRect, {
      x: leftX,
      y: cardY + 2.1,
      w: leftW,
      h: 0.85,
      rectRadius: 0.1,
      fill: { color: BRAND.card },
      line: { color: BRAND.border, width: 1.25 }
    });
    slide5.addShape(pptx.ShapeType.roundRect, {
      x: leftX + 0.25,
      y: cardY + 2.3,
      w: 1.1,
      h: 0.45,
      rectRadius: 0.1,
      fill: { color: BRAND.primaryLight }
    });
    slide5.addText("PHASE 3", {
      x: leftX + 0.25,
      y: cardY + 2.3,
      w: 1.1,
      h: 0.45,
      align: 'center',
      valign: 'middle',
      fontFace: BRAND.fontFace,
      fontSize: 11,
      bold: true,
      color: BRAND.primary
    });
    slide5.addText("Secure shared patient records nationwide", {
      x: leftX + 1.55,
      y: cardY + 2.3,
      w: leftW - 1.8,
      h: 0.45,
      valign: 'middle',
      fontFace: BRAND.fontFace,
      fontSize: 16,
      bold: true,
      color: BRAND.foreground
    });

    // Closing statement highlight card
    const heroCardY = cardY + 3.15;
    const heroCardH = 1.05;

    slide5.addShape(pptx.ShapeType.roundRect, {
      x: leftX,
      y: heroCardY,
      w: leftW,
      h: heroCardH,
      rectRadius: 0.12,
      fill: { color: BRAND.card },
      line: { color: BRAND.primary, width: 1.75 }
    });

    slide5.addShape(pptx.ShapeType.roundRect, {
      x: leftX + 0.25,
      y: heroCardY + 0.2,
      w: 0.08,
      h: heroCardH - 0.4,
      rectRadius: 0.04,
      fill: { color: BRAND.primary }
    });

    slide5.addText("THE ODYSSEY OUTCOME", {
      x: leftX + 0.45,
      y: heroCardY + 0.15,
      w: leftW - 0.7,
      h: 0.25,
      fontFace: BRAND.fontFace,
      fontSize: 10,
      bold: true,
      color: BRAND.primary,
      charSpacing: 1.5
    });

    slide5.addText("Less duplicate testing. More accessible care.", {
      x: leftX + 0.45,
      y: heroCardY + 0.42,
      w: leftW - 0.7,
      h: 0.5,
      fontFace: BRAND.fontFace,
      fontSize: 18,
      bold: true,
      color: BRAND.foreground
    });

    // Right Side: Philippine Regional Choropleth Map Card
    const rightMapX = 7.75;
    const rightMapW = 4.58;
    const rightMapH = 4.2;

    slide5.addImage({
      path: path.join(OUTPUT_DIR, 'choropleth_map.png'),
      x: rightMapX,
      y: cardY,
      w: rightMapW,
      h: rightMapH
    });

    slide5.addNotes("Starting as a standalone hospital core, Odyssey expands into a federated network uniting rural health units and clinics. Real-time choropleth mapping delivers automated DOH-PIDSR disease surveillance across all 17 regions, securing shared patient records nationwide.");
  }

  // Save presentation to both root and scripts folder
  const rootPptxPath = path.join(__dirname, '..', 'Odyssey_Healthcare_OS.pptx');
  const localPptxPath = path.join(__dirname, 'Odyssey_Healthcare_OS.pptx');
  await pptx.writeFile({ fileName: rootPptxPath });
  fs.copyFileSync(rootPptxPath, localPptxPath);
  console.log('Saved updated PowerPoint deck to project root:', rootPptxPath);
}

// 3. Generate HTML Preview for visual verification and screenshots
async function generateHtmlPreviewAndScreenshots() {
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Odyssey Healthcare OS - Presentation Deck</title>
  <link href="https://fonts.googleapis.com/css2?family=Segoe+UI:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #E2E8F0;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
    }
    .slide-wrapper {
      position: relative;
      width: 1200px;
      height: 675px; /* 16:9 ratio */
      background: #F8F9FA;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(22, 34, 47, 0.12);
      padding: 44px 60px 28px 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .slide-header {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .category-kicker {
      font-size: 13px;
      font-weight: 700;
      color: #F15A24;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .slide-headline {
      font-size: 38px;
      font-weight: 700;
      color: #16222F;
      line-height: 1.15;
    }
    .slide-content {
      flex: 1;
      display: flex;
      align-items: center;
      margin: 18px 0;
    }
    .slide-footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .footer-brand {
      font-weight: 700;
      color: #F15A24;
      letter-spacing: 1px;
    }
    .footer-brand span {
      font-weight: 600;
      color: #5A6B78;
    }
    .footer-num {
      color: #5A6B78;
      font-weight: 600;
    }
    .speaker-notes-box {
      width: 1200px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 14px 20px;
      margin-top: -24px;
      font-size: 14px;
      color: #5A6B78;
      line-height: 1.5;
    }
    .speaker-notes-box strong {
      color: #F15A24;
    }

    /* Slide 1 Custom */
    .slide1-card {
      width: 100%;
      height: 100%;
      background: #FFFFFF;
      border: 1.5px solid #E2E8F0;
      border-radius: 16px;
      display: flex;
      align-items: center;
      padding: 40px 60px;
      gap: 50px;
    }
    .logo-frame {
      width: 260px;
      height: 260px;
      background: #FFFFFF;
      border: 1.5px solid #E2E8F0;
      border-radius: 20px;
      box-shadow: 0 6px 20px rgba(22, 34, 47, 0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
      padding: 10px;
    }
    .logo-frame img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .slide1-text {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .tagline-text {
      font-size: 24px;
      color: #5A6B78;
      font-weight: 400;
    }
    .hero-pill {
      align-self: flex-start;
      padding: 8px 20px;
      background: #FFF4ED;
      border: 1px solid #F15A24;
      border-radius: 20px;
      font-size: 13.5px;
      font-weight: 700;
      color: #F15A24;
      margin-top: 6px;
    }

    /* Slide 2 Custom */
    .role-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
      width: 100%;
      height: 100%;
    }
    .role-card {
      background: #FFFFFF;
      border: 1.5px solid #E2E8F0;
      border-radius: 14px;
      padding: 36px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      justify-content: center;
      gap: 20px;
    }
    .role-icon {
      width: 120px;
      height: 120px;
    }
    .role-badge {
      display: inline-block;
      padding: 6px 20px;
      background: #FFF4ED;
      border: 1px solid #F15A24;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      color: #F15A24;
      letter-spacing: 0.5px;
    }
    .role-phrase {
      font-size: 20px;
      font-weight: 700;
      color: #16222F;
      line-height: 1.35;
    }

    /* Slide 3 Custom */
    .encounter-layout {
      display: grid;
      grid-template-columns: 400px 1fr;
      gap: 36px;
      width: 100%;
      height: 100%;
      align-items: center;
    }
    .anatomy-card {
      background: #FFFFFF;
      border: 1.5px solid #E2E8F0;
      border-radius: 14px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .anatomy-card img {
      max-height: 94%;
      max-width: 94%;
      object-fit: contain;
    }
    .encounter-phrases {
      display: flex;
      flex-direction: column;
      gap: 20px;
      justify-content: center;
    }
    .phrase-card {
      background: #FFFFFF;
      border: 1.5px solid #E2E8F0;
      border-radius: 14px;
      padding: 22px 28px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .phrase-card.active-card {
      border: 2px solid #F15A24;
    }
    .phrase-kicker {
      align-self: flex-start;
      padding: 4px 14px;
      background: #FFF4ED;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      color: #F15A24;
    }
    .phrase-text {
      font-size: 21px;
      font-weight: 700;
      color: #16222F;
    }

    /* Slide 4 Custom */
    .ops-layout {
      display: flex;
      flex-direction: column;
      gap: 20px;
      width: 100%;
      height: 100%;
      justify-content: center;
    }
    .flow-card-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .flow-card-row img {
      width: 100%;
      height: auto;
    }
    .ops-phrases-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    .ops-card {
      background: #FFFFFF;
      border: 1.5px solid #E2E8F0;
      border-radius: 14px;
      padding: 28px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 14px;
    }
    .ops-card .ops-kicker {
      padding: 4px 14px;
      background: #FFF4ED;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      color: #F15A24;
      letter-spacing: 0.5px;
    }
    .ops-card .ops-phrase {
      font-size: 19px;
      font-weight: 700;
      color: #16222F;
      line-height: 1.35;
    }

    /* Slide 5 Custom: Side by side Timeline + Choropleth Map */
    .slide5-layout {
      display: grid;
      grid-template-columns: 1fr 480px;
      gap: 32px;
      width: 100%;
      height: 100%;
      align-items: center;
    }
    .slide5-left {
      display: flex;
      flex-direction: column;
      gap: 16px;
      justify-content: center;
    }
    .milestone-card {
      background: #FFFFFF;
      border: 1.5px solid #E2E8F0;
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .milestone-card.active-milestone {
      border: 2px solid #F15A24;
    }
    .milestone-phase {
      padding: 6px 14px;
      background: #FFF4ED;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      color: #F15A24;
      flex-shrink: 0;
    }
    .milestone-title {
      font-size: 18px;
      font-weight: 700;
      color: #16222F;
    }
    .closing-card {
      background: #FFFFFF;
      border: 2px solid #F15A24;
      border-radius: 14px;
      padding: 20px 24px;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
    }
    .closing-card::before {
      content: '';
      position: absolute;
      left: 14px;
      top: 16px;
      bottom: 16px;
      width: 4px;
      background: #F15A24;
      border-radius: 2px;
    }
    .closing-content {
      padding-left: 14px;
    }
    .closing-kicker {
      font-size: 11px;
      font-weight: 700;
      color: #F15A24;
      letter-spacing: 1.5px;
    }
    .closing-phrase {
      font-size: 21px;
      font-weight: 700;
      color: #16222F;
    }
    .choropleth-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .choropleth-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>

  <!-- SLIDE 1 -->
  <div id="slide1" class="slide-wrapper">
    <div></div>
    <div class="slide-content">
      <div class="slide1-card">
        <div class="logo-frame">
          <img class="slide1-logo" src="presentation_assets/odc_logo_3d.png" alt="ODC Odyssey Logo">
        </div>
        <div class="slide1-text">
          <div class="category-kicker">PHILIPPINES FEDERATED HEALTH NETWORK</div>
          <h1 class="slide-headline" style="font-size: 48px;">Odyssey Healthcare OS</h1>
          <div class="tagline-text">One operating system for connected care.</div>
          <div class="hero-pill">Production-ready hospital core</div>
        </div>
      </div>
    </div>
    <div class="slide-footer">
      <div class="footer-brand">ODC • ODYSSEY</div>
      <div class="footer-num">01 / 05</div>
    </div>
  </div>
  <div class="speaker-notes-box">
    <strong>Speaker Notes:</strong> Odyssey Healthcare OS is a production-grade hospital operating system designed for the Philippine healthcare landscape. It unifies clinical, administrative, and financial operations from day one.
  </div>

  <!-- SLIDE 2 -->
  <div id="slide2" class="slide-wrapper">
    <div class="slide-header">
      <div class="category-kicker">Unified Ecosystem</div>
      <h2 class="slide-headline">Built for every role</h2>
    </div>
    <div class="slide-content">
      <div class="role-grid">
        <div class="role-card">
          <img class="role-icon" src="presentation_assets/icon_patient.png" alt="Patients">
          <div class="role-badge">PATIENTS</div>
          <div class="role-phrase">booking, portal, teleconsult, QR payments</div>
        </div>
        <div class="role-card">
          <img class="role-icon" src="presentation_assets/icon_provider.png" alt="Providers">
          <div class="role-badge">PROVIDERS</div>
          <div class="role-phrase">queue, SOAP notes, prescriptions, referrals</div>
        </div>
        <div class="role-card">
          <img class="role-icon" src="presentation_assets/icon_admin.png" alt="Admins">
          <div class="role-badge">ADMINS</div>
          <div class="role-phrase">analytics, billing, inventory, HMO claims</div>
        </div>
      </div>
    </div>
    <div class="slide-footer">
      <div class="footer-brand">ODC • ODYSSEY <span>• HEALTHCARE OS</span></div>
      <div class="footer-num">02 / 05</div>
    </div>
  </div>
  <div class="speaker-notes-box">
    <strong>Speaker Notes:</strong> Odyssey unifies patient self-service, physician clinical workflows, and administrative operations into a single platform. This eliminates fragmented software silos and duplicate data entry across the facility.
  </div>

  <!-- SLIDE 3 -->
  <div id="slide3" class="slide-wrapper">
    <div class="slide-header">
      <div class="category-kicker">Clinical Workflows</div>
      <h2 class="slide-headline">Care that starts with the body</h2>
    </div>
    <div class="slide-content">
      <div class="encounter-layout">
        <div class="anatomy-card">
          <img src="presentation_assets/musculoskeletal_figure.png" alt="Musculoskeletal Figure">
        </div>
        <div class="encounter-phrases">
          <div class="phrase-card active-card">
            <div class="phrase-kicker">01 • VISUAL CHARTING</div>
            <div class="phrase-text">Tap a region, see history, add diagnosis</div>
          </div>
          <div class="phrase-card">
            <div class="phrase-kicker">02 • RAPID DOCUMENTATION</div>
            <div class="phrase-text">Simple Mode for fast SOAP notes</div>
          </div>
          <div class="phrase-card">
            <div class="phrase-kicker">03 • CONSULTATION AUDIT</div>
            <div class="phrase-text">Auto-tracked encounter time</div>
          </div>
        </div>
      </div>
    </div>
    <div class="slide-footer">
      <div class="footer-brand">ODC • ODYSSEY <span>• HEALTHCARE OS</span></div>
      <div class="footer-num">03 / 05</div>
    </div>
  </div>
  <div class="speaker-notes-box">
    <strong>Speaker Notes:</strong> Clinicians can visually chart encounters by selecting anatomical regions directly on a digital body map. Odyssey surfaces relevant patient history instantly and accelerates documentation with fast SOAP templates.
  </div>

  <!-- SLIDE 4 -->
  <div id="slide4" class="slide-wrapper">
    <div class="slide-header">
      <div class="category-kicker">Operations & Finance</div>
      <h2 class="slide-headline">Every item accounted for</h2>
    </div>
    <div class="slide-content">
      <div class="ops-layout">
        <div class="flow-card-row">
          <img src="presentation_assets/flow_diagram.png" alt="Inventory and Billing Flow Diagram">
        </div>
        <div class="ops-phrases-row">
          <div class="ops-card">
            <div class="ops-kicker">DEPARTMENTAL STOCK</div>
            <div class="ops-phrase">Real-time stock per department</div>
          </div>
          <div class="ops-card">
            <div class="ops-kicker">BATCH DISPENSING</div>
            <div class="ops-phrase">Expiry alerts</div>
          </div>
          <div class="ops-card">
            <div class="ops-kicker">UNIVERSAL HEALTHCARE</div>
            <div class="ops-phrase">PhilHealth-ready, even for free-service hospitals</div>
          </div>
        </div>
      </div>
    </div>
    <div class="slide-footer">
      <div class="footer-brand">ODC • ODYSSEY <span>• HEALTHCARE OS</span></div>
      <div class="footer-num">04 / 05</div>
    </div>
  </div>
  <div class="speaker-notes-box">
    <strong>Speaker Notes:</strong> When clinical staff scan or tag supplies at the bedside, inventory is automatically relieved by earliest expiration date. Charges immediately populate the patient's Statement of Account (SOA) and PhilHealth claims, preventing revenue leakage.
  </div>

  <!-- SLIDE 5: Roadmap & Choropleth Disease Trend -->
  <div id="slide5" class="slide-wrapper">
    <div class="slide-header">
      <div class="category-kicker">Strategic Roadmap & Surveillance</div>
      <h2 class="slide-headline">From hospital to national network</h2>
    </div>
    <div class="slide-content">
      <div class="slide5-layout">
        <div class="slide5-left">
          <div class="milestone-card">
            <div class="milestone-phase">PHASE 1</div>
            <div class="milestone-title">Single hospital, production-ready</div>
          </div>
          <div class="milestone-card active-milestone">
            <div class="milestone-phase">PHASE 2</div>
            <div class="milestone-title">RHUs and clinics join</div>
          </div>
          <div class="milestone-card">
            <div class="milestone-phase">PHASE 3</div>
            <div class="milestone-title">Secure shared patient records nationwide</div>
          </div>
          <div class="closing-card">
            <div class="closing-content">
              <div class="closing-kicker">THE ODYSSEY OUTCOME</div>
              <div class="closing-phrase">Less duplicate testing. More accessible care.</div>
            </div>
          </div>
        </div>
        <div class="choropleth-container">
          <img src="presentation_assets/choropleth_map.png" alt="Philippine Disease Trend Choropleth Map">
        </div>
      </div>
    </div>
    <div class="slide-footer">
      <div class="footer-brand">ODC • ODYSSEY <span>• HEALTHCARE OS</span></div>
      <div class="footer-num">05 / 05</div>
    </div>
  </div>
  <div class="speaker-notes-box">
    <strong>Speaker Notes:</strong> Starting as a standalone hospital core, Odyssey expands into a federated network uniting rural health units and clinics. Real-time choropleth mapping delivers automated DOH-PIDSR disease surveillance across all 17 regions, securing shared patient records nationwide.
  </div>

</body>
</html>
  `;

  const previewHtmlPath = path.join(__dirname, 'Odyssey_Presentation_Preview.html');
  fs.writeFileSync(previewHtmlPath, htmlContent, 'utf8');
  console.log('Saved presentation preview HTML:', previewHtmlPath);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('file:///' + previewHtmlPath.replace(/\\/g, '/'));

  for (let i = 1; i <= 5; i++) {
    const el = await page.$(`#slide${i}`);
    if (el) {
      await el.screenshot({ path: path.join(OUTPUT_DIR, `slide_${i}_preview.png`) });
      console.log(`Saved slide_${i}_preview.png`);
    }
  }
  await browser.close();
}

async function main() {
  console.log('--- Generating Graphic Assets with ODC Branding & Choropleth Map ---');
  await generateGraphicAssets();
  console.log('--- Building PowerPoint Presentation ---');
  await buildPresentation();
  console.log('--- Generating Visual QA Previews ---');
  await generateHtmlPreviewAndScreenshots();
  console.log('Presentation generation complete!');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
