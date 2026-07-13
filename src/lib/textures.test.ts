import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadAbortableBitmap, loadAbortableTexture } from "./textures";
import { fetchBlob } from "./net";

vi.mock("./net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./net")>();
  return { ...actual, fetchBlob: vi.fn() };
});

const mockedFetchBlob = vi.mocked(fetchBlob);

function fakeBitmap(): ImageBitmap {
  return {
    width: 4,
    height: 4,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

beforeEach(() => {
  mockedFetchBlob.mockReset();
  vi.unstubAllGlobals();
});

describe("loadAbortableTexture", () => {
  it("produces a decode-flipped, upload-unflipped texture (TextureLoader parity)", async () => {
    const bitmap = fakeBitmap();
    const decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", decode);
    mockedFetchBlob.mockResolvedValue(new Blob(["x"]));

    const texture = await loadAbortableTexture("https://example.test/img");
    expect(texture.image).toBe(bitmap);
    // Orientation contract: flip once at decode, never at upload.
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: "flipY",
    });
    expect(texture.flipY).toBe(false);
    // needsUpdate is a write-only setter that bumps version — assert its effect.
    expect(texture.version).toBeGreaterThan(0);
  });

  it("propagates the abort from the fetch layer", async () => {
    mockedFetchBlob.mockRejectedValue(
      new DOMException("aborted", "AbortError")
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadAbortableTexture("https://example.test/img", {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("honors an abort that lands during decode — closes the bitmap, no leak", async () => {
    const bitmap = fakeBitmap();
    const controller = new AbortController();
    mockedFetchBlob.mockResolvedValue(new Blob(["x"]));
    // The fetch resolves, then the abort fires while decode is in flight.
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.resolve(bitmap);
      })
    );
    await expect(
      loadAbortableTexture("https://example.test/img", {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(bitmap.close).toHaveBeenCalled();
  });
});

describe("loadAbortableBitmap", () => {
  it("leaves orientation alone for canvas compositors", async () => {
    const decode = vi.fn().mockResolvedValue(fakeBitmap());
    vi.stubGlobal("createImageBitmap", decode);
    mockedFetchBlob.mockResolvedValue(new Blob(["x"]));
    await loadAbortableBitmap("https://example.test/img");
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), {});
  });
});
