import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import {
  VARIANT_SPECS,
  VariantSpec,
  ORIGINAL_MASTER_WEBP_QUALITY,
  planVariantSize,
} from "../../shared/variant-specs";
import { AWS_REGION, MEDIA_S3_BUCKET } from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });

export type RenderVariantsInput = {
  fileId: string;
  keyPrefix: string;
  sourceKey: string;
};

export type RenderedVariant = {
  name: "ORIGINAL" | "THUMB" | "CARD" | "ZOOM";
  format: "WEBP" | "JPEG";
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

type MasterContext = {
  master: Buffer;
  width: number;
  height: number;
  folder: string;
};

async function renderOriginal(ctx: MasterContext): Promise<RenderedVariant> {
  const body = await sharp(ctx.master)
    .webp({ quality: ORIGINAL_MASTER_WEBP_QUALITY })
    .toBuffer();
  const storageKey = `${ctx.folder}/original.webp`;
  await putVariant(storageKey, body, "image/webp");
  return {
    name: "ORIGINAL",
    format: "WEBP",
    storageKey,
    width: ctx.width,
    height: ctx.height,
    sizeBytes: body.length,
  };
}

async function renderSized(
  ctx: MasterContext,
  spec: VariantSpec,
  format: "WEBP" | "JPEG"
): Promise<RenderedVariant> {
  const size = planVariantSize(ctx.width, ctx.height, spec.longEdge);
  const resized = sharp(ctx.master).resize(spec.longEdge, spec.longEdge, {
    fit: "inside",
    withoutEnlargement: true,
  });
  const isWebp = format === "WEBP";
  const body = await (isWebp
    ? resized.webp({ quality: spec.webpQuality })
    : resized.jpeg({ quality: spec.jpegQuality })
  ).toBuffer();
  const storageKey = `${ctx.folder}/${spec.name.toLowerCase()}.${
    isWebp ? "webp" : "jpg"
  }`;
  await putVariant(storageKey, body, isWebp ? "image/webp" : "image/jpeg");
  return {
    name: spec.name,
    format,
    storageKey,
    width: size.width,
    height: size.height,
    sizeBytes: body.length,
  };
}

export async function handler(
  event: RenderVariantsInput
): Promise<RenderVariantsOutput> {
  const sourceBytes = await getObjectBytes(event.sourceKey);

  const master = await sharp(sourceBytes).rotate().png().toBuffer();

  const masterMeta = await sharp(master).metadata();
  const ctx: MasterContext = {
    master,
    width: masterMeta.width ?? 0,
    height: masterMeta.height ?? 0,
    folder: `${event.keyPrefix}/${event.fileId}`,
  };

  const variants = await Promise.all([
    renderOriginal(ctx),
    ...VARIANT_SPECS.flatMap((spec) => [
      renderSized(ctx, spec, "WEBP"),
      renderSized(ctx, spec, "JPEG"),
    ]),
  ]);

  return { fileId: event.fileId, keyPrefix: event.keyPrefix, variants };
}
