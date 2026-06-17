const fs = require("node:fs");
const path = require("node:path");
const pdfParse = require("pdf-parse");

async function main() {
  const pdfPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "Monopoly.pdf");
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "graphify-out", "Monopoly.pdf.txt");

  const buffer = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(buffer);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, parsed.text ?? "", "utf8");

  const preview = (parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  process.stdout.write(
    JSON.stringify(
      {
        pdfPath,
        pages: parsed.numpages,
        textChars: (parsed.text ?? "").length,
        outPath,
        preview,
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

