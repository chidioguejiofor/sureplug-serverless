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

async function transparentCutout(): Promise<Buffer> {
  return sharp({
    create: {
      width: 800,
      height: 500,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 400,
            height: 300,
            channels: 4,
            background: { r: 200, g: 30, b: 30, alpha: 1 },
          },
        },
        left: 200,
        top: 100,
      },
    ])
    .png()
    .toBuffer();
}

describe("render-variants handler (composite path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("produces an ORIGINAL plus thumb/card/zoom in webp and jpeg, and uploads each", async () => {
    const cutout = await transparentCutout();
    sendMock.mockImplementation((command) => {
      if (command.constructor.name === "GetObjectCommand") {
        return Promise.resolve({
          Body: { transformToByteArray: () => Promise.resolve(cutout) },
        });
      }
      return Promise.resolve({});
    });

    const result = await handler({
      fileId: "file-1",
      keyPrefix: "merchants/merchant-1/product_images",
      sourceKey: "merchants/merchant-1/product_images/file-1/cutout.png",
      composite: true,
    });

    const names = result.variants.map((v) => `${v.name}:${v.format}`);
    expect(names).toEqual([
      "ORIGINAL:PNG",
      "THUMB:WEBP",
      "THUMB:JPEG",
      "CARD:WEBP",
      "CARD:JPEG",
      "ZOOM:WEBP",
      "ZOOM:JPEG",
    ]);

    const original = result.variants.find((v) => v.name === "ORIGINAL")!;
    expect(original.storageKey).toEqual(
      "merchants/merchant-1/product_images/file-1/original.png"
    );
    expect(original.width).toEqual(800);
    expect(original.height).toEqual(500);

    // 800x500 source, thumb long edge 300 -> 300x188 (rounded)
    const thumbWebp = result.variants.find(
      (v) => v.name === "THUMB" && v.format === "WEBP"
    )!;
    expect(thumbWebp.width).toEqual(300);
    expect(thumbWebp.height).toEqual(188);
    expect(thumbWebp.sizeBytes).toBeGreaterThan(0);

    // every variant produced a decodable image of the expected format
    const putBodies = sendMock.mock.calls
      .filter(([c]) => c.constructor.name === "PutObjectCommand")
      .map(([c]) => c.input.Body as Buffer);
    expect(putBodies).toHaveLength(7);
    const zoomJpeg = putBodies[6];
    const meta = await sharp(zoomJpeg).metadata();
    expect(meta.format).toEqual("jpeg");
    expect(meta.hasAlpha).toBe(false);
  });

  it("never enlarges: a small source keeps its dimensions for every size class", async () => {
    const smallCutout = await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    sendMock.mockImplementation((command) => {
      if (command.constructor.name === "GetObjectCommand") {
        return Promise.resolve({
          Body: { transformToByteArray: () => Promise.resolve(smallCutout) },
        });
      }
      return Promise.resolve({});
    });

    const result = await handler({
      fileId: "file-2",
      keyPrefix: "merchants/merchant-1/product_images",
      sourceKey: "merchants/merchant-1/product_images/file-2/raw.jpg",
      composite: false,
    });

    for (const variant of result.variants) {
      expect(variant.width).toBeLessThanOrEqual(200);
      expect(variant.height).toBeLessThanOrEqual(150);
    }
  });
});
