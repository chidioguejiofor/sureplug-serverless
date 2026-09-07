import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/client-s3")>(
    "@aws-sdk/client-s3"
  );
  class FakeS3Client {
    send = sendMock;
  }
  return { ...actual, S3Client: FakeS3Client };
});

import { handler } from "../handler";

async function opaqueMaster(
  width: number,
  height: number
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 245, g: 245, b: 245 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: Math.round(width / 2),
            height: Math.round(height / 2),
            channels: 3,
            background: { r: 200, g: 30, b: 30 },
          },
        },
        left: Math.round(width / 4),
        top: Math.round(height / 4),
      },
    ])
    .png()
    .toBuffer();
}

describe("render-variants handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("produces an ORIGINAL plus thumb/card/zoom in webp and jpeg, and uploads each", async () => {
    const master = await opaqueMaster(800, 500);
    sendMock.mockImplementation((command) => {
      if (command.constructor.name === "GetObjectCommand") {
        return Promise.resolve({
          Body: { transformToByteArray: () => Promise.resolve(master) },
        });
      }
      return Promise.resolve({});
    });

    const result = await handler({
      fileId: "file-1",
      keyPrefix: "merchants/merchant-1/product_images",
      sourceKey: "merchants/merchant-1/product_images/file-1/master.png",
    });

    const names = result.variants.map((v) => `${v.name}:${v.format}`);
    expect(names).toEqual([
      "ORIGINAL:WEBP",
      "THUMB:WEBP",
      "THUMB:JPEG",
      "CARD:WEBP",
      "CARD:JPEG",
      "ZOOM:WEBP",
      "ZOOM:JPEG",
    ]);

    const original = result.variants.find((v) => v.name === "ORIGINAL")!;
    expect(original.storageKey).toEqual(
      "merchants/merchant-1/product_images/file-1/original.webp"
    );
    expect(original.width).toEqual(800);
    expect(original.height).toEqual(500);
    const putByKey = new Map<string, Buffer>(
      sendMock.mock.calls
        .filter(([c]) => c.constructor.name === "PutObjectCommand")
        .map(([c]) => [c.input.Key as string, c.input.Body as Buffer])
    );
    expect(
      (await sharp(putByKey.get(original.storageKey)!).metadata()).format
    ).toEqual("webp");

    // 800x500 source, thumb long edge 300 -> 300x188 (rounded)
    const thumbWebp = result.variants.find(
      (v) => v.name === "THUMB" && v.format === "WEBP"
    )!;
    expect(thumbWebp.width).toEqual(300);
    expect(thumbWebp.height).toEqual(188);
    expect(thumbWebp.sizeBytes).toBeGreaterThan(0);

    // every variant was uploaded, each key exactly once
    expect(putByKey.size).toEqual(7);
    for (const variant of result.variants) {
      expect(putByKey.has(variant.storageKey)).toBe(true);
    }

    const zoomJpeg = result.variants.find(
      (v) => v.name === "ZOOM" && v.format === "JPEG"
    )!;
    const meta = await sharp(putByKey.get(zoomJpeg.storageKey)!).metadata();
    expect(meta.format).toEqual("jpeg");
    expect(meta.hasAlpha).toBe(false);
  });

  it("never enlarges: a small source keeps its dimensions for every size class", async () => {
    const smallMaster = await opaqueMaster(200, 150);
    sendMock.mockImplementation((command) => {
      if (command.constructor.name === "GetObjectCommand") {
        return Promise.resolve({
          Body: { transformToByteArray: () => Promise.resolve(smallMaster) },
        });
      }
      return Promise.resolve({});
    });

    const result = await handler({
      fileId: "file-2",
      keyPrefix: "merchants/merchant-1/product_images",
      sourceKey: "merchants/merchant-1/product_images/file-2/raw.jpg",
    });

    for (const variant of result.variants) {
      expect(variant.width).toBeLessThanOrEqual(200);
      expect(variant.height).toBeLessThanOrEqual(150);
    }
  });
});
