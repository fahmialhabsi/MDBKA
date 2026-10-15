/**
 * Riset (15 Okt 2026): tulis posisi tertutup satu akun (hasil evaluateTrades) ke JSON
 * untuk scripts/research/learning_account_factors.py. Hanya membaca History + entries.
 * Pakai: npx tsx scripts/research/dump_account_trades.ts <commonDir> <tradesDir> <login> <keluaran.json>
 */
import { writeFileSync } from "node:fs";
import { collectAccountEvaluations } from "../../server/routes/evaluationRoutes";

const [commonDir, tradesDir, login, out] = process.argv.slice(2);
if (commonDir === undefined || tradesDir === undefined || login === undefined || out === undefined) {
  console.error("Pakai: npx tsx scripts/research/dump_account_trades.ts <commonDir> <tradesDir> <login> <keluaran.json>");
  process.exit(1);
}
const acc = collectAccountEvaluations(commonDir, tradesDir, {}).find((a) => a.login === login);
if (acc === undefined) {
  console.error(`History login ${login} tidak ditemukan di ${commonDir}`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify(acc.evaluation.trades), "utf8");
console.log(`${acc.evaluation.trades.length} posisi (${acc.currency || "mata uang tidak diketahui"}) -> ${out}`);
