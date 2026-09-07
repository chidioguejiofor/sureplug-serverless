export type VariantSpec = {
  name: "THUMB" | "CARD" | "ZOOM";
  longEdge: number;
  webpQuality: number;
  jpegQuality: number;
};

export const ORIGINAL_MASTER_WEBP_QUALITY = 92;

export const VARIANT_SPECS: VariantSpec[] = [
  { name: "THUMB", longEdge: 300, webpQuality: 75, jpegQuality: 80 },
  { name: "CARD", longEdge: 600, webpQuality: 80, jpegQuality: 83 },
  { name: "ZOOM", longEdge: 1600, webpQuality: 82, jpegQuality: 85 },
];

export function planVariantSize(
  sourceWidth: number,
  sourceHeight: number,
  longEdge: number
): { width: number; height: number } {
  const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
  if (sourceLongEdge <= longEdge) {
    return { width: sourceWidth, height: sourceHeight };
  }

  const scale = longEdge / sourceLongEdge;
  return {
    width: Math.round(sourceWidth * scale),
    height: Math.round(sourceHeight * scale),
  };
}
