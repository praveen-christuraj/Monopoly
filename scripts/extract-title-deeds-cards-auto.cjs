const fs = require("node:fs");
const path = require("node:path");
const Jimp = require("jimp");
const { createWorker } = require("tesseract.js");

function normalize(input) {
  return String(input || "")
    .replace(/\r/g, "\n")
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function avgBrightness(rgba) {
  return (rgba.r + rgba.g + rgba.b) / 3;
}

function detectRowBands(img) {
  const w = img.getWidth();
  const h = img.getHeight();
  const stepX = Math.max(2, Math.floor(w / 220));
  const stepY = 2;

  const brightness = new Array(Math.ceil(h / stepY)).fill(0);
  const samples = new Array(brightness.length).fill(0);

  for (let yi = 0, y = 0; y < h; yi += 1, y += stepY) {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < w; x += stepX) {
      const rgba = Jimp.intToRGBA(img.getPixelColor(x, y));
      sum += avgBrightness(rgba);
      count += 1;
    }
    brightness[yi] = sum / Math.max(1, count);
    samples[yi] = y;
  }

  const isGap = brightness.map((b) => b > 245);
  const gaps = [];
  let runStart = null;
  for (let i = 0; i < isGap.length; i += 1) {
    if (isGap[i] && runStart === null) runStart = i;
    if ((!isGap[i] || i === isGap.length - 1) && runStart !== null) {
      const end = isGap[i] ? i : i - 1;
      const runLen = end - runStart + 1;
      if (runLen >= 3) {
        const yStart = samples[runStart];
        const yEnd = samples[end] + stepY;
        gaps.push({ yStart, yEnd, runLen });
      }
      runStart = null;
    }
  }

  const separators = [0, ...gaps.map((g) => Math.floor((g.yStart + g.yEnd) / 2)), h];
  const uniq = Array.from(new Set(separators)).sort((a, b) => a - b);

  const bands = [];
  for (let i = 0; i < uniq.length - 1; i += 1) {
    const y0 = uniq[i];
    const y1 = uniq[i + 1];
    const bandH = y1 - y0;
    if (bandH < 120) continue;
    bands.push({ y0, y1, height: bandH });
  }

  return bands;
}

function pickName(text) {
  const lines = normalize(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

  const cleaned = lines
    .map((line) =>
      line
        .replace(/TITLE\s+DEED/gi, "")
        .replace(/PURCH\w*\s*PRICE.*/i, "")
        .replace(/RENT.*/i, "")
        .replace(/\b\d+\b/g, "")
        .replace(/[^\p{L}\s()]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => line.length >= 3);

  return cleaned[0] ?? "";
}

function pickNumber(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const num = Number.parseInt(match[1], 10);
  return Number.isFinite(num) ? num : null;
}

function parsePropertyRent(text) {
  const rent = pickNumber(text, /RENT\s*\$?\s*(\d+)/i);
  const house1 = pickNumber(text, /With\s*1\s*House\s*\$?\s*(\d+)/i);
  const house2 = pickNumber(text, /With\s*2\s*Houses?\s*\$?\s*(\d+)/i);
  const house3 = pickNumber(text, /With\s*3\s*Houses?\s*\$?\s*(\d+)/i);
  const house4 = pickNumber(text, /With\s*4\s*Houses?\s*\$?\s*(\d+)/i);
  const hotel = pickNumber(text, /With\s*HOTEL\s*\$?\s*(\d+)/i);
  if ([rent, house1, house2, house3, house4, hotel].some((v) => typeof v !== "number")) {
    return null;
  }
  return [rent, house1, house2, house3, house4, hotel];
}

function parseRailroadRent(text) {
  const nums = Array.from(text.matchAll(/\b(?:Rent|If)\b[^\d]{0,40}\$?\s*(\d{2,3})/gi))
    .map((m) => Number.parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n));
  const uniq = Array.from(new Set(nums));
  if (uniq.length < 4) return null;
  const sorted = uniq.sort((a, b) => a - b);
  const base = sorted[0];
  const tail = sorted.slice(-3);
  return [base, tail[0], tail[1], tail[2]];
}

function guessType(name, text) {
  const upperName = name.toUpperCase();
  const upper = text.toUpperCase();
  if (upperName.includes("ELECTRIC") || upperName.includes("WATER WORKS") || upper.includes("UTILITY")) {
    return "utility";
  }
  if (
    upperName.includes("TERMINUS") ||
    upperName.includes("STATION") ||
    upperName.includes("CENTRAL") ||
    upper.includes("RR") ||
    upper.includes("RR'S")
  ) {
    return "railroad";
  }
  return "property";
}

async function main() {
  const imagePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "graphify-out", "Monopoly_board_ocr.png");
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "graphify-out", "monopoly-title-deeds.auto.json");

  const page = await Jimp.read(imagePath);
  const width = page.getWidth();
  const height = page.getHeight();

  const panelLeft = Math.floor(width * 0.52);
  const panelTop = 0;
  const panelRight = Math.floor(width * 0.99);
  const panelBottom = Math.floor(height * 0.73);
  const panel = page.clone().crop(panelLeft, panelTop, panelRight - panelLeft, panelBottom - panelTop);

  const rowBands = detectRowBands(panel);
  const cols = 5;
  const colW = Math.floor(panel.getWidth() / cols);

  const worker = await createWorker("eng");
  await worker.setParameters({ tessedit_pageseg_mode: "6" });

  const cards = [];
  for (const band of rowBands) {
    for (let col = 0; col < cols; col += 1) {
      const x0 = clamp(col * colW, 0, panel.getWidth() - 1);
      const x1 = clamp((col + 1) * colW, 0, panel.getWidth());
      const y0 = clamp(band.y0, 0, panel.getHeight() - 1);
      const y1 = clamp(band.y1, 0, panel.getHeight());

      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 120 || h < 120) continue;

      const crop = panel.clone().crop(x0, y0, w, h);
      crop.greyscale().contrast(0.35).normalize().resize(w * 2, h * 2);
      const buffer = await crop.getBufferAsync(Jimp.MIME_PNG);
      const result = await worker.recognize(buffer);
      const text = normalize(result?.data?.text || "");

      if (!/PURCH/i.test(text)) continue;
      const purchasePrice = pickNumber(text, /PURCH\w*\s*PRICE\s*[$§]?\s*(\d+)/i);
      if (!purchasePrice) continue;

      const name = pickName(text);
      const type = guessType(name, text);
      const mortgageValue = pickNumber(text, /Mortgage\s*Value\s*\$?\s*(\d+)/i);
      const houseCost = pickNumber(text, /Houses?\s*cost\s*\$?\s*(\d+)/i);

      let rent = null;
      if (type === "property") rent = parsePropertyRent(text);
      if (type === "railroad") rent = parseRailroadRent(text);
      if (type === "utility") rent = [4, 10];

      cards.push({
        name,
        type,
        priceUSD: purchasePrice,
        mortgageValue: mortgageValue ?? null,
        houseCost: houseCost ?? null,
        rent,
        band,
        col,
      });
    }
  }

  await worker.terminate();

  const output = {
    imagePath,
    extractedAt: new Date().toISOString(),
    panelBox: { panelLeft, panelTop, panelRight, panelBottom },
    rowBands,
    cards,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  process.stdout.write(JSON.stringify({ outPath, bands: rowBands.length, cards: cards.length }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exitCode = 1;
});

