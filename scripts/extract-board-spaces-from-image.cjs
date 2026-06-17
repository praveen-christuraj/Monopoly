const fs = require("node:fs");
const path = require("node:path");
const Jimp = require("jimp");
const { createWorker } = require("tesseract.js");

function normalizeOcrText(input) {
  return String(input || "")
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
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

function classifySpace(text, fallbackIndex) {
  const t = text.toUpperCase();
  if (fallbackIndex === 0 && t.includes("GO")) return "go";
  if (t.includes("GO TO JAIL")) return "go-to-jail";
  if (t.includes("FREE") && t.includes("PARK")) return "free-parking";
  if (t.includes("JAIL") || t.includes("VISITING")) return "jail";
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
  const values = candidates.map((value) => Number.parseInt(value, 10)).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const plausible = values.filter((v) => v >= 10 && v <= 5000);
  if (plausible.length === 0) return null;
  return plausible[plausible.length - 1];
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

  const best = lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .sort((a, b) => b.length - a.length)[0];

  return best;
}

function rotateSpacesToGo(spaces) {
  const goCandidate = spaces.find((space) => space.type === "go" || space.name.toUpperCase() === "GO");
  if (!goCandidate) return spaces;
  const offset = goCandidate.index;
  if (offset === 0) return spaces;
  return spaces.map((space) => ({
    ...space,
    index: (space.index - offset + 40) % 40,
  })).sort((a, b) => a.index - b.index);
}

async function main() {
  const imagePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "graphify-out", "Monopoly_board_ocr.png");
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "graphify-out", "monopoly-board-spaces.json");

  const image = await Jimp.read(imagePath);
  const width = image.getWidth();
  const height = image.getHeight();
  const size = Math.min(width, height);
  const margin = Math.round(size * 0.045);
  const boardLeft = Math.round((width - size) / 2) + margin;
  const boardTop = Math.round((height - size) / 2) + margin;
  const boardSize = size - margin * 2;
  const tile = Math.floor(boardSize / 11);

  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
  });

  const spaces = [];
  for (let index = 0; index < 40; index += 1) {
    const { row, col } = getGridPosition(index);
    const pad = Math.floor(tile * 0.1);
    const x = Math.max(0, boardLeft + col * tile - pad);
    const y = Math.max(0, boardTop + row * tile - pad);
    const w = Math.min(width - x, tile + pad * 2);
    const h = Math.min(height - y, tile + pad * 2);

    const crop = image.clone().crop(x, y, w, h);
    const buffer = await crop.getBufferAsync(Jimp.MIME_PNG);
    const result = await worker.recognize(buffer);
    const rawText = result?.data?.text || "";
    const text = normalizeOcrText(rawText);

    const type = classifySpace(text, index);
    const priceUSD = type === "property" || type === "railroad" || type === "utility" ? extractPrice(text) : null;
    const name = extractName(text) || (type === "chance" ? "Chance" : type === "community-chest" ? "Community Chest" : "");

    spaces.push({
      index,
      name,
      type,
      priceUSD,
      ocr: text,
    });
  }

  await worker.terminate();

  const rotated = rotateSpacesToGo(spaces);
  const output = {
    imagePath,
    extractedAt: new Date().toISOString(),
    boardBox: { boardLeft, boardTop, boardSize, tile, margin },
    spaces: rotated,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        outPath,
        spaces: rotated.length,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exitCode = 1;
});

