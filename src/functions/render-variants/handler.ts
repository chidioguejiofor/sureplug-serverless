import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { composeOntoNeutralBackground } from "../../shared/compose-on-neutral-background";
import { VARIANT_SPECS, planVariantSize } from "../../shared/variant-specs";
import {
  AWS_REGION,
  MEDIA_S3_BUCKET,
  NEUTRAL_BACKGROUND_COLOR,
} from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });

export type RenderVariantsInput = {
  fileId: string;
  keyPrefix: string;
  sourceKey: string;
  composite: boolean;
};

export type RenderedVariant = {
  name: "ORIGINAL" | "THUMB" | "CARD" | "ZOOM";
  format: "PNG" | "WEBP" | "JPEG";
  storageKey: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type RenderVariantsOutput = {
  fileId: string;
  keyPrefix: string;
  variants: RenderedVariant[];
};

async function getObjectBytes(key: string): Promise<Buffer> {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: MEDIA_S3_BUCKET, Key: key })
  );
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`Could not read object body for ${key}`);
  }
  return Buffer.from(bytes);
}

async function putVariant(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: MEDIA_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function handler(
  event: RenderVariantsInput
): Promise<RenderVariantsOutput> {
  const sourceBytes = await getObjectBytes(event.sourceKey);

  const master = event.composite
    ? await composeOntoNeutralBackground(sourceBytes, NEUTRAL_BACKGROUND_COLOR)
    : await sharp(sourceBytes).rotate().png().toBuffer();

  const masterMeta = await sharp(master).metadata();
  const masterWidth = masterMeta.width ?? 0;
  const masterHeight = masterMeta.height ?? 0;

  const folder = `${event.keyPrefix}/${event.fileId}`;
  const variants: RenderedVariant[] = [];

  const originalKey = `${folder}/original.png`;
  await putVariant(originalKey, master, "image/png");
  variants.push({
    name: "ORIGINAL",
    format: "PNG",
    storageKey: originalKey,
    width: masterWidth,
    height: masterHeight,
    sizeBytes: master.length,
  });

  for (const spec of VARIANT_SPECS) {
    const size = planVariantSize(masterWidth, masterHeight, spec.longEdge);

    const webp = await sharp(master)
      .resize(spec.longEdge, spec.longEdge, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: spec.webpQuality })
      .toBuffer();
    const webpKey = `${folder}/${spec.name.toLowerCase()}.webp`;
    await putVariant(webpKey, webp, "image/webp");
    variants.push({
      name: spec.name,
      format: "WEBP",
      storageKey: webpKey,
      width: size.width,
      height: size.height,
      sizeBytes: webp.length,
    });

    const jpeg = await sharp(master)
      .resize(spec.longEdge, spec.longEdge, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: spec.jpegQuality })
      .toBuffer();
    const jpegKey = `${folder}/${spec.name.toLowerCase()}.jpg`;
    await putVariant(jpegKey, jpeg, "image/jpeg");
    variants.push({
      name: spec.name,
      format: "JPEG",
      storageKey: jpegKey,
      width: size.width,
      height: size.height,
      sizeBytes: jpeg.length,
    });
  }

  return { fileId: event.fileId, keyPrefix: event.keyPrefix, variants };
}
