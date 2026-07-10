import { describe, it, expect, vi } from "vitest";
import {
  UserLocationOverlay,
  geolocationErrorMessage,
  type GeolocationLike,
} from "./UserLocationOverlay";

/** A fake Geolocation that grants a fixed position. */
const granting = (lat: number, lon: number): GeolocationLike => ({
  getCurrentPosition: (success) =>
    success({ coords: { latitude: lat, longitude: lon } }),
});

/** A fake Geolocation that fails with a given error code. */
const failing = (code: number): GeolocationLike => ({
  getCurrentPosition: (_success, error) => error({ code }),
});

describe("geolocationErrorMessage", () => {
  it("maps each standard error code to a distinct, human message", () => {
    expect(geolocationErrorMessage(1)).toMatch(/denied/i);
    expect(geolocationErrorMessage(2)).toMatch(/unavailable/i);
    expect(geolocationErrorMessage(3)).toMatch(/too long|timed? out/i);
    expect(geolocationErrorMessage(99)).toMatch(/couldn't|could not/i);
  });
});

describe("UserLocationOverlay", () => {
  it("is an ephemeral, off-by-default overlay with a pin identity", () => {
    const overlay = new UserLocationOverlay(vi.fn(), granting(0, 0));
    expect(overlay.ephemeral).toBe(true);
    expect(overlay.object.visible).toBe(false);
    expect(overlay.id).toBe("you-are-here");
    expect(overlay.label).toBeTruthy();
    expect(overlay.icon).toContain("<svg");
  });

  it("drops a pin and offers a 'You are here!' hover on a granted location", async () => {
    const onError = vi.fn();
    const overlay = new UserLocationOverlay(onError, granting(51.5, -0.12));
    await overlay.ensureLoaded();

    expect(onError).not.toHaveBeenCalled();
    expect(overlay.object.children).toHaveLength(1); // the pin points
    expect(overlay.hoverSource).toBeDefined();
    expect(overlay.hoverSource!.describe(0)).toBe("You are here!");
  });

  it("does not re-request once located (retryable only after failure)", async () => {
    const geo = granting(10, 20);
    const spy = vi.spyOn(geo, "getCurrentPosition");
    const overlay = new UserLocationOverlay(vi.fn(), geo);
    await overlay.ensureLoaded();
    await overlay.ensureLoaded();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports denial through onError and rejects, leaving no pin", async () => {
    const onError = vi.fn();
    const overlay = new UserLocationOverlay(onError, failing(1));
    await expect(overlay.ensureLoaded()).rejects.toThrow();
    expect(onError).toHaveBeenCalledWith(geolocationErrorMessage(1));
    expect(overlay.hoverSource).toBeUndefined();
    expect(overlay.object.children).toHaveLength(0);
  });

  it("stays retryable after a failure (does not memoize the rejection)", async () => {
    const onError = vi.fn();
    let attempt = 0;
    const geo: GeolocationLike = {
      getCurrentPosition: (success, error) => {
        attempt++;
        if (attempt === 1) error({ code: 3 });
        else success({ coords: { latitude: 1, longitude: 2 } });
      },
    };
    const overlay = new UserLocationOverlay(onError, geo);
    await expect(overlay.ensureLoaded()).rejects.toThrow();
    await overlay.ensureLoaded(); // second toggle succeeds
    expect(overlay.hoverSource).toBeDefined();
  });

  it("reports gracefully when the browser has no geolocation", async () => {
    const onError = vi.fn();
    const overlay = new UserLocationOverlay(onError, undefined);
    await expect(overlay.ensureLoaded()).rejects.toThrow();
    expect(onError).toHaveBeenCalledWith(
      expect.stringMatching(/can't|cannot/i)
    );
  });
});
