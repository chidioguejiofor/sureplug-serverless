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
      width: 600,
      height: 400,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 300,
            height: 200,
            channels: 4,
            background: { r: 40, g: 90, b: 200, alpha: 1 },
          },
        },
        left: 150,
        top: 100,
      },
    ])
    .png()
    .toBuffer();
}

describe("compose-master handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("composites the cutout onto an opaque master and uploads it", async () => {
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
      cutoutKey: "merchants/merchant-1/product_images/file-1/cutout.png",
    });

    expect(result).toEqual({
      fileId: "file-1",
      keyPrefix: "merchants/merchant-1/product_images",
      masterKey: "merchants/merchant-1/product_images/file-1/master.png",
      width: 600,
      height: 400,
      needsUpscale: true,
    });

    const put = sendMock.mock.calls.find(
      ([c]) => c.constructor.name === "PutObjectCommand"
    )![0];
    expect(put.input.Key).toEqual(
      "merchants/merchant-1/product_images/file-1/master.png"
    );
    const masterMeta = await sharp(put.input.Body as Buffer).metadata();
    expect(masterMeta.format).toEqual("png");
    expect(masterMeta.width).toEqual(600);
    expect(masterMeta.height).toEqual(400);
    // the subject pixels survive the composite as fully opaque
    const { data } = await sharp(put.input.Body as Buffer)
      .ensureAlpha()
      .extractChannel("alpha")
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data.reduce((min, v) => Math.min(min, v), 255)).toEqual(255);
  });

  it("does not flag a large master for upscaling", async () => {
    const cutout = await sharp({
      create: {
        width: 2000,
        height: 1600,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    sendMock.mockImplementation((command) => {
      if (command.constructor.name === "GetObjectCommand") {
        return Promise.resolve({
          Body: { transformToByteArray: () => Promise.resolve(cutout) },
        });
      }
      return Promise.resolve({});
    });

    const result = await handler({
      fileId: "file-2",
      keyPrefix: "merchants/merchant-1/product_images",
      cutoutKey: "merchants/merchant-1/product_images/file-2/cutout.png",
    });

    expect(result.needsUpscale).toBe(false);
  });
});
