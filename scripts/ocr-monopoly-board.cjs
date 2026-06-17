const fs = require("node:fs");
const path = require("node:path");

async function callGemini({ apiKey, model, prompt, imageBuffer, mimeType }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: imageBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const message =
      json?.error?.message || `Gemini request failed with status ${res.status}`;
    throw new Error(message);
  }

  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") ??
    "";
  return { raw: json, text };
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  return null;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY in environment.");
  }

  const imagePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "graphify-out", "Monopoly_board_ocr.png");
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, "..", "graphify-out", "monopoly-board-extracted.json");

  const imageBuffer = fs.readFileSync(imagePath);
  const mimeType = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

  const prompt = [
    "You are extracting data from a Monopoly board image.",
    "Task: read every board tile name and any printed purchase price beside it.",
    "Output MUST be valid JSON ONLY (no prose).",
    "",
    "Schema:",
    "{",
    '  "spaces": [',
    "    {",
    '      "index": 0,',
    '      "name": "string",',
    '      "type": "go|property|railroad|utility|tax|chance|community-chest|jail|free-parking|go-to-jail|other",',
    '      "priceUSD": number|null',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- The board has 40 spaces indexed 0..39 clockwise starting at GO.",
    "- If a tile is a city/property, set type=property and include priceUSD if shown.",
    "- For railroads/stations, type=railroad and include priceUSD if shown.",
    "- For utilities, type=utility and include priceUSD if shown.",
    "- For Chance and Community Chest tiles, set type=chance or community-chest.",
    "- For Income Tax / Super Tax tiles, type=tax and priceUSD can be null.",
    "- If a price is printed with a currency symbol, return the numeric value only.",
    "- If you cannot read a value confidently, use null for priceUSD.",
    "- Preserve the exact tile names as printed (case-insensitive), but fix obvious OCR typos.",
  ].join("\n");

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const { text, raw } = await callGemini({
    apiKey,
    model,
    prompt,
    imageBuffer,
    mimeType,
  });

  const parsed = extractJson(text);
  const output = {
    model,
    imagePath,
    extractedAt: new Date().toISOString(),
    parsed,
    preview: String(text || "").slice(0, 1200),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  const count = Array.isArray(parsed?.spaces) ? parsed.spaces.length : 0;
  process.stdout.write(
    JSON.stringify(
      {
        outPath,
        spaces: count,
        hasParsed: Boolean(parsed && count > 0),
      },
      null,
      2
    ) + "\n"
  );

  if (!parsed || count === 0) {
    process.stderr.write("No parsed spaces found. Inspect preview in output JSON.\n");
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exitCode = 1;
});

