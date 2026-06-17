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

function avgBrightness(rgba) {
  return (rgba.r + rgba.g + rgba.b) / 3;
}

function tightCrop(img) {
  const w = img.getWidth();
  const h = img.getHeight();
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const rgba = Jimp.intToRGBA(img.getPixelColor(x, y));
      if (avgBrightness(rgba) > 246) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX <= minX || maxY <= minY) return img;
  const pad = Math.floor(Math.min(w, h) * 0.01);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(w, maxX + pad);
  const bottom = Math.min(h, maxY + pad);
  return img.clone().crop(left, top, right - left, bottom - top);
}

function pickName(text) {
  const lines = normalize(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);

  const cleaned = lines
    .map((line) =>
      line
        .replace(/TITLE\s+DEED/gi, "")
        .replace(/PURCHASE\s+PRICE.*/i, "")
        .replace(/RENT.*/i, "")
        .replace(/\b\d+\b/g, "")
        .replace(/[^\p{L}\s()]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => line.length >= 3);

  if (cleaned.length === 0) return "";
  return cleaned[0];
}

function pickNumber(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const num = Number.parseInt(match[1], 10);
  return Number.isFinite(num) ? num : null;
}

function pickPlausibleNumber(value, { min, max }) {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function extractAllNumbers(text, pattern) {
  const results = [];
  const re = new RegExp(pattern, "gi");
  let m;
  while ((m = re.exec(text))) {
    const num = Number.parseInt(m[1], 10);
    if (Number.isFinite(num)) results.push(num);
  }
  return results;
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
  const base = pickNumber(text, /Rent\s*\$?\s*(\d+)/i);
  const nums = extractAllNumbers(text, /If\s*(?:2|3|4)\s*RR'?S?\s*(?:ARE\s*OWNED)?\s*\$?\s*(\d+)/i);
  const rent = [base, nums[0], nums[1], nums[2]].filter((v) => typeof v === "number");
  if (rent.length === 4) return rent;
  if (base && nums.length >= 3) return [base, nums[0], nums[1], nums[2]];
  return null;
}

async function main() {
  const imagePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "graphify-out", "Monopoly_board_ocr.png");
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "graphify-out", "monopoly-title-deeds.json");

  const page = await Jimp.read(imagePath);
  const width = page.getWidth();
  const height = page.getHeight();

  const panelLeft = Math.floor(width * 0.52);
  const panelTop = Math.floor(height * 0.0);
  const panelRight = Math.floor(width * 0.99);
  const panelBottom = Math.floor(height * 0.73);
  const rawPanel = page.clone().crop(panelLeft, panelTop, panelRight - panelLeft, panelBottom - panelTop);
  const panel = tightCrop(rawPanel);

  const cols = 5;
  const rows = 7;
  const cellW = Math.floor(panel.getWidth() / cols);
  const cellH = Math.floor(panel.getHeight() / rows);
  const padX = Math.floor(cellW * 0.02);
  const padY = Math.floor(cellH * 0.03);

  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
  });

  const cards = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = Math.max(0, col * cellW + padX);
      const y = Math.max(0, row * cellH + padY);
      const w = Math.min(panel.getWidth() - x, cellW - padX * 2);
      const h = Math.min(panel.getHeight() - y, cellH - padY * 2);
      if (w < 40 || h < 40) continue;

      const crop = panel.clone().crop(x, y, w, h);
      const cropFull = crop
        .clone()
        .greyscale()
        .contrast(0.35)
        .normalize()
        .resize(w * 2, h * 2);
      const buffer = await cropFull.getBufferAsync(Jimp.MIME_PNG);
      const result = await worker.recognize(buffer);
      const text = normalize(result?.data?.text || "");

      if (!/PURCH/i.test(text)) continue;
      const purchasePrice = pickNumber(text, /PURCH\w*\s*PRICE\s*[$§]?\s*(\d+)/i);
      const priceUSD = pickPlausibleNumber(purchasePrice, { min: 30, max: 600 });
      if (!priceUSD) continue;

      const headerHeight = Math.max(60, Math.floor(cropFull.getHeight() * 0.24));
      const cropHeader = cropFull.clone().crop(0, 0, cropFull.getWidth(), headerHeight).resize(cropFull.getWidth() * 1.1, headerHeight * 1.6);
      const headerBuffer = await cropHeader.getBufferAsync(Jimp.MIME_PNG);
      const headerResult = await worker.recognize(headerBuffer);
      const headerText = normalize(headerResult?.data?.text || "");

      const name = pickName(headerText) || pickName(text);
      const type = guessType(name, text);

      const mortgageValue = pickPlausibleNumber(
        pickNumber(text, /Mortgage\s*Value\s*\$?\s*(\d+)/i),
        { min: 20, max: 600 }
      );
      const housesCost = pickPlausibleNumber(
        pickNumber(text, /Houses?\s*cost\s*\$?\s*(\d+)/i),
        { min: 20, max: 600 }
      );

      let rent = null;
      if (type === "property") rent = parsePropertyRent(text);
      if (type === "railroad") rent = parseRailroadRent(text);
      if (type === "utility") rent = [4, 10];

      cards.push({
        name,
        type,
        priceUSD,
        mortgageValue: mortgageValue ?? null,
        houseCost: housesCost ?? null,
        rent,
        ocr: text,
        grid: { row, col },
      });
    }
  }

  await worker.terminate();

  const output = {
    imagePath,
    extractedAt: new Date().toISOString(),
    panelBox: { panelLeft, panelTop, panelRight, panelBottom, cols, rows },
    cards,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  process.stdout.write(JSON.stringify({ outPath, cards: cards.length }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exitCode = 1;
});
