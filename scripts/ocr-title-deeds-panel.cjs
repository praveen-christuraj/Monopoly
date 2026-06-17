const fs = require("node:fs");
const path = require("node:path");
const Jimp = require("jimp");
const { createWorker } = require("tesseract.js");

function normalizeOcrText(input) {
  return String(input || "")
    .replace(/\r/g, "\n")
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main() {
  const imagePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "graphify-out", "Monopoly_board_ocr.png");
  const outTextPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "graphify-out", "monopoly-title-deeds-ocr.txt");

  const page = await Jimp.read(imagePath);
  const width = page.getWidth();
  const height = page.getHeight();

  const left = Math.floor(width * 0.52);
  const top = Math.floor(height * 0.02);
  const right = Math.floor(width * 0.99);
  const bottom = Math.floor(height * 0.79);

  const crop = page.clone().crop(left, top, right - left, bottom - top);

  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
  });

  const buffer = await crop.getBufferAsync(Jimp.MIME_PNG);
  const result = await worker.recognize(buffer);
  await worker.terminate();

  const text = normalizeOcrText(result?.data?.text || "");
  fs.mkdirSync(path.dirname(outTextPath), { recursive: true });
  fs.writeFileSync(outTextPath, text, "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        outTextPath,
        chars: text.length,
        preview: text.slice(0, 600),
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

