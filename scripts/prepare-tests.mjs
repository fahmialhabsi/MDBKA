import { writeFileSync } from "node:fs";

// Paket MDBKA bertipe "module", sehingga file .js hasil kompilasi
// CommonJS di dist-tests perlu penanda "commonjs" agar node
// menjalankannya sebagai CommonJS.
writeFileSync(
  new URL("../dist-tests/package.json", import.meta.url),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n"
);
