const fs = require("node:fs");
const path = require("node:path");
const Jimp = require("jimp");
const { createWorker } = require("tesseract.js");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeOcrText(input) {
  return String(input || "")
    .replace(/\r/g, "\n")
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getGridPosition(index) {
  if (index <= 10) return { row: 10, col: 10 - index };
  if (index <= 20) return { row: 10 - (index - 10), col: 0 };
  if (index <= 30) return { row: 0, col: index - 20 };
  return { row: index - 30, col: 10 };
}

function classifyByIndexAndText(index, text) {
  const t = text.toUpperCase();
  if (index === 0) return "go";
  if (index === 10) return "jail";
  if (index === 20) return "free-parking";
  if (index === 30) return "go-to-jail";
  if (t.includes("CHANCE") || t.includes("?")) return "chance";
  if (t.includes("COMMUNITY") || t.includes("CHEST")) return "community-chest";
  if (t.includes("TAX")) return "tax";
  if (t.includes("RAIL") || t.includes("STATION") || t.includes("RAILWAY")) return "railroad";
  if (t.includes("WATER") || t.includes("ELECTRIC") || t.includes("UTILITY") || t.includes("BOARD"))
    return "utility";
  return "property";
}

function extractPrice(text) {
  const cleaned = text.replace(/[,]/g, " ");
  const candidates = cleaned.match(/\b\d{2,4}\b/g) || [];
  if (candidates.length === 0) return null;
  const values = candidates
    .map((value) => Number.parseInt(value, 10))
    .filter((v) => Number.isFinite(v) && v >= 10 && v <= 5000);
  if (values.length === 0) return null;
  return values[values.length - 1];
}

function extractName(text) {
  const stripped = text
    .replace(/[$₹]/g, " ")
    .replace(/\b\d{1,5}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const lines = stripped
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const best = lines.sort((a, b) => b.length - a.length)[0];
  return best.replace(/\s+/g, " ").trim();
}

async function detectBoardBox(pageImage) {
  const width = pageImage.getWidth();
  const height = pageImage.getHeight();
  const maxX = Math.floor(width * 0.48);
  const maxY = Math.floor(height * 0.74);

  let minX = maxX;
  let minY = maxY;
  let foundMaxX = 0;
  let foundMaxY = 0;

  for (let y = 0; y < maxY; y += 2) {
    for (let x = 0; x < maxX; x += 2) {
      const rgba = Jimp.intToRGBA(pageImage.getPixelColor(x, y));
      const nearWhite = rgba.r > 245 && rgba.g > 245 && rgba.b > 245;
      if (nearWhite) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      foundMaxX = Math.max(foundMaxX, x);
      foundMaxY = Math.max(foundMaxY, y);
    }
  }

  if (foundMaxX <= minX || foundMaxY <= minY) {
    throw new Error("Failed to detect board bounding box.");
  }

  const pad = Math.round(Math.min(width, height) * 0.01);
  const left = clamp(minX - pad, 0, width - 1);
  const top = clamp(minY - pad, 0, height - 1);
  const right = clamp(foundMaxX + pad, 0, width - 1);
  const bottom = clamp(foundMaxY + pad, 0, height - 1);

  const boxWidth = right - left;
  const boxHeight = bottom - top;
  const size = Math.min(boxWidth, boxHeight);

  return {
    left,
    top,
    size,
    width: size,
    height: size,
  };
}

async function main() {
  const imagePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "graphify-out", "Monopoly_board_ocr.png");
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "graphify-out", "monopoly-board-spaces-from-pdf.json");

  const page = await Jimp.read(imagePath);
  const { left, top, size } = await detectBoardBox(page);
  const board = page.clone().crop(left, top, size, size);
  const tile = Math.floor(size / 11);

  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
  });

  const spaces = [];
  for (let index = 0; index < 40; index += 1) {
    const { row, col } = getGridPosition(index);
    const pad = Math.floor(tile * 0.12);
    const x = clamp(col * tile - pad, 0, size - 1);
    const y = clamp(row * tile - pad, 0, size - 1);
    const w = clamp(tile + pad * 2, 1, size - x);
    const h = clamp(tile + pad * 2, 1, size - y);

    const crop = board.clone().crop(x, y, w, h);
    const buffer = await crop.getBufferAsync(Jimp.MIME_PNG);
    const result = await worker.recognize(buffer);
    const text = normalizeOcrText(result?.data?.text || "");

    const type = classifyByIndexAndText(index, text);
    const name = extractName(text) || (type === "chance" ? "Chance" : type === "community-chest" ? "Community Chest" : "");
    const priceUSD =
      type === "property" || type === "railroad" || type === "utility"
        ? extractPrice(text)
        : null;

    spaces.push({
      index,
      name,
      type,
      priceUSD,
      ocr: text,
    });
  }

  await worker.terminate();

  const output = {
    imagePath,
    extractedAt: new Date().toISOString(),
    boardBox: { left, top, size, tile },
    spaces,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  process.stdout.write(JSON.stringify({ outPath, spaces: spaces.length }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exitCode = 1;
});

