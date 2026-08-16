import { describe, it, expect, vi } from "vitest";
import { once } from "./types";

describe("once", () => {
  it("runs the load a single time while it keeps succeeding", async () => {
    const load = vi.fn(() => Promise.resolve());
    const ensure = once(load);

    await ensure();
    await ensure();
    await ensure();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    const load = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 0))
    );
    const ensure = once(load);

    await Promise.all([ensure(), ensure(), ensure()]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure instead of replaying the cached rejection", async () => {
    // The regression this guards: `promise ??= load()` memoizes the rejected
    // promise, so an overlay whose feed blipped stays broken for the life of
    // the page — every later enable re-rejects instantly without a fetch.
    const load = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(undefined);
    const ensure = once(load);

    await expect(ensure()).rejects.toThrow("network down");
    await expect(ensure()).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps retrying across repeated failures, then settles once it works", async () => {
    const load = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValue(undefined);
    const ensure = once(load);

    await expect(ensure()).rejects.toThrow("first");
    await expect(ensure()).rejects.toThrow("second");
    await expect(ensure()).resolves.toBeUndefined();
    // The success is memoized like any other: no fourth attempt.
    await ensure();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("propagates the rejection to every caller waiting on the failed load", async () => {
    const load = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("network down"));
    const ensure = once(load);

    const results = await Promise.allSettled([ensure(), ensure()]);

    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
