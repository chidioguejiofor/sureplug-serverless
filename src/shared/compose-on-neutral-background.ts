import sharp from "sharp";
import { computeMaskBounds } from "./mask-bounds";
import { computeContactShadowGeometry, ShadowGeometry } from "./contact-shadow";
import {
  CONTACT_SHADOW_WIDTH_RATIO,
  CONTACT_SHADOW_HEIGHT_RATIO,
  CONTACT_SHADOW_BLUR_RATIO,
  CONTACT_SHADOW_OPACITY,
} from "./settings";

function buildShadowSvg(
  width: number,
  height: number,
  geometry: ShadowGeometry
): Buffer {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${geometry.blurStdDeviation}" /></filter></defs>
    <ellipse cx="${geometry.centerX}" cy="${geometry.centerY}" rx="${geometry.radiusX}" ry="${geometry.radiusY}" fill="black" fill-opacity="${geometry.opacity}" filter="url(#blur)" />
  </svg>`;
  return Buffer.from(svg);
}

export async function composeOntoNeutralBackground(
  transparentCutout: Buffer,
  backgroundColor: string
): Promise<Buffer> {
  const { data: alpha, info } = await sharp(transparentCutout)
    .clone()
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = computeMaskBounds(alpha, info.width, info.height);

  const layers: sharp.OverlayOptions[] = [];
  if (bounds) {
    const geometry = computeContactShadowGeometry(
      bounds,
      CONTACT_SHADOW_WIDTH_RATIO,
      CONTACT_SHADOW_HEIGHT_RATIO,
      CONTACT_SHADOW_BLUR_RATIO,
      CONTACT_SHADOW_OPACITY
    );
    layers.push({ input: buildShadowSvg(info.width, info.height, geometry) });
  }
  layers.push({ input: transparentCutout });

  return sharp({
    create: {
      width: info.width,
      height: info.height,
      channels: 3,
      background: backgroundColor,
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}
