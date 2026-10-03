import {
  pickLiveSource,
  resolveLiveBroker,
} from "../../server/types/liveSource";

export const LIVE_SOURCE_TEST_COUNT = 8;

export async function runLiveSourceTests(): Promise<boolean> {
  let passCount = 0;
  let testNum = 345;

  function check(name: string, cond: boolean): void {
    if (cond) {
      console.log(`ok - ${testNum}. ${name}`);
      passCount++;
    } else {
      console.error(`✗ ${testNum}. ${name}`);
    }
    testNum++;
  }

  // 345: param absen -> sumber default (backward-compatible perilaku lama).
  check(
    "broker absen memakai sumber default (OTB/legacy)",
    resolveLiveBroker(undefined) === "orbitraderberjangka",
  );

  // 346: "finex" valid.
  check("broker finex valid", resolveLiveBroker("finex") === "finex");

  // 347: "orbitraderberjangka" eksplisit valid.
  check(
    "broker orbitraderberjangka eksplisit valid",
    resolveLiveBroker("orbitraderberjangka") === "orbitraderberjangka",
  );

  // 348: nilai tak dikenal -> null (route wajib 400, tanpa fallback diam).
  check(
    "broker tak dikenal ditolak (null)",
    resolveLiveBroker("mt4") === null &&
      resolveLiveBroker("") === null &&
      resolveLiveBroker(null) === null &&
      resolveLiveBroker(42) === null,
  );

  // 349: pick sumber default saat OTB diminta.
  const def = { tag: "default" };
  const fin = { tag: "finex" };
  check(
    "pick OTB mengembalikan reader default",
    pickLiveSource("orbitraderberjangka", def, fin) === def,
  );

  // 350: pick finex saat finex diminta.
  check(
    "pick finex mengembalikan reader finex",
    pickLiveSource("finex", def, fin) === fin,
  );

  // 351: finex belum dikonfigurasi -> null (route wajib 404 jujur).
  check(
    "finex tanpa reader mengembalikan null (fail-closed)",
    pickLiveSource("finex", def, null) === null,
  );

  // 352: default null (belum ada data) tetap null, bukan reader lain.
  check(
    "default tanpa reader tidak bocor ke reader finex",
    pickLiveSource("orbitraderberjangka", null, fin) === null,
  );

  return passCount === LIVE_SOURCE_TEST_COUNT;
}
