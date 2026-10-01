/** Jenis region yang sedang aktif dipilih (mode). */
export type RegionKind = "marketWatch" | "dataWindow";

/** Kotak region dalam koordinat tampilan (display pixels). */
export interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Ukuran kotak minimum agar dianggap seleksi valid. */
export const REGION_MIN_SIZE = 10;

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Titik pointer relatif terhadap elemen canvas, dijepit ke dalam
 * batas elemen. Murni (menerima angka, bukan event) agar teruji.
 */
export function canvasPointFromClient(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): Point {
  return {
    x: clamp(clientX - rect.left, 0, rect.width),
    y: clamp(clientY - rect.top, 0, rect.height),
  };
}

/** Normalisasi dua titik drag menjadi region berdimensi positif. */
export function normalizeRegion(start: Point, current: Point): ImageRegion {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

/** Region valid bila lebar dan tinggi memenuhi ukuran minimum. */
export function isRegionBigEnough(
  region: ImageRegion,
  minSize = REGION_MIN_SIZE
): boolean {
  return region.width >= minSize && region.height >= minSize;
}

/**
 * Konversi koordinat tampilan ke koordinat gambar asli untuk crop OCR.
 * Faktor skala dihitung per sumbu dari ukuran aktual elemen.
 */
export function convertToNaturalCoords(
  region: ImageRegion,
  displaySize: { width: number; height: number },
  naturalSize: { width: number; height: number }
): ImageRegion {
  if (displaySize.width <= 0 || displaySize.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const scaleX = naturalSize.width / displaySize.width;
  const scaleY = naturalSize.height / displaySize.height;

  return {
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    width: Math.round(region.width * scaleX),
    height: Math.round(region.height * scaleY),
  };
}

export function regionLabel(kind: RegionKind): string {
  return kind === "marketWatch" ? "Market Watch" : "Data Window";
}

export function regionColor(kind: RegionKind): string {
  return kind === "marketWatch" ? "#eab308" : "#22d3ee";
}
