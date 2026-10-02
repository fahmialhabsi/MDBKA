// Konfigurasi ESLint modern (flat config) untuk MDBKA:
// React + TypeScript + Vite + React Hooks.
// Dipakai melalui: npm run lint  ->  eslint .
//
// CATATAN TypeScript side-by-side (alasan teknis):
// Proyek memakai TypeScript 7 untuk `npm run build`, tetapi
// typescript-eslint 8.x menolak TS >= 7 (lihat error resminya dan
// https://github.com/typescript-eslint/typescript-eslint/issues/10940).
// Mengikuti anjuran blog TS 7 ("running side-by-side"), lint memakai
// salinan TypeScript 5.9.3 stabil dari paket alias `typescript-for-lint`
// HANYA di dalam proses ESLint. Compiler utama proyek (TS 7) tidak diubah.
// Pengalihan dilakukan lewat Module._resolveFilename sebelum
// typescript-eslint dimuat, karena paket itu me-resolve "typescript"
// secara internal dan tidak menyediakan opsi pengganti.
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const rootRequire = createRequire(import.meta.url);
const tsLintPkgPath = rootRequire.resolve("typescript-for-lint/package.json");
const tsLintDir = path.dirname(tsLintPkgPath);
const tsLintPkg = JSON.parse(readFileSync(tsLintPkgPath, "utf8"));
const tsLintMain = path.join(tsLintDir, tsLintPkg.main ?? "lib/typescript.js");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "typescript" || request.startsWith("typescript/")) {
    if (request === "typescript") return tsLintMain;
    return path.join(tsLintDir, request.slice("typescript/".length));
  }
  return originalResolveFilename.call(this, request, ...rest);
};

// Wajib require sinkron SETELAH pengalihan di atas (import statis akan
// dievaluasi lebih dulu dan memicu blokir TS 7 sebelum hook terpasang).
const tseslint = rootRequire("typescript-eslint");

export default tseslint.config(
  {
    ignores: ["dist/", "dist-tests/", "dist-server/", "node_modules/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Aturan Hooks terbaru (mendukung React 19). Varian `flat`
  // adalah format flat-config yang benar untuk ESLint 9/10.
  reactHooks.configs.flat["recommended-latest"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    rules: {
      // Tolak `any` eksplisit kecuali ada komentar alasan + eslint-disable
      // beralasan pada baris tersebut.
      "@typescript-eslint/no-explicit-any": "error",
      // Tangkap import dan variabel yang tidak dipakai (termasuk TS/TSX).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Tangkap deklarasi/import duplikat dalam satu modul.
      "no-duplicate-imports": "error",
    },
  },
);
