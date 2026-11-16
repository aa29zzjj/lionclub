import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const modules = fileURLToPath(new URL("../node_modules/", import.meta.url));

export async function copyCardOcr(destination) {
  await mkdir(destination, { recursive: true });
  const assets = {
    "worker.min.js": "tesseract.js/dist/worker.min.js",
    "tesseract-core-lstm.wasm.js": "tesseract.js-core/tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js": "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "chi_tra.traineddata.gz": "@tesseract.js-data/chi_tra/4.0.0_best_int/chi_tra.traineddata.gz",
    "eng.traineddata.gz": "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    "LICENSE": "tesseract.js-core/LICENSE",
  };
  await Promise.all(Object.entries(assets).map(([name, source]) => copyFile(join(modules, source), join(destination, name))));
}

if (process.argv[2] === "--web" && process.env.NEXT_PUBLIC_NEXT_PHASE_ENABLED === "true") {
  await copyCardOcr(fileURLToPath(new URL("../public/card-ocr/", import.meta.url)));
}
