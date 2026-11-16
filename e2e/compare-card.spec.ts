import { expect, test, type Page } from "@playwright/test";
import { awaitAppInteractive, awaitHashSettled } from "./boot";

/**
 * Place-vs-place framing and the month on the card. Nominatim, ERA5, and the
 * GIBS freshness probe are stubbed so the month under test is June 2026
 * rather than whatever DescribeDomains happens to publish.
 */
function stubPlace(
  name: string,
  lat: string,
  lon: string,
  box: [string, string, string, string]
) {
  return {
    name,
    display_name: name,
    lat,
    lon,
    type: "administrative",
    category: "boundary",
    boundingbox: box,
  };
}

const PLACES: Record<
  string,
  { lat: string; lon: string; box: [string, string, string, string] }
> = {
  austin: {
    lat: "30.27",
    lon: "-97.74",
    box: ["30.10", "30.52", "-97.94", "-97.57"],
  },
  dallas: {
    lat: "32.78",
    lon: "-96.80",
    box: ["32.62", "33.02", "-96.99", "-96.56"],
  },
  "san antonio": {
    lat: "29.42",
    lon: "-98.49",
    box: ["29.22", "29.64", "-98.70", "-98.30"],
  },
};

function placeFor(url: string) {
  const text = decodeURIComponent(url).replace(/\+/g, " ").toLowerCase();
  const key =
    Object.keys(PLACES).find((name) => text.includes(name)) ?? "houston";
  const found = PLACES[key] ?? {
    lat: "29.76",
    lon: "-95.37",
    box: ["29.52", "30.11", "-95.82", "-95.01"] as [
      string,
      string,
      string,
      string,
    ],
  };
  const name = key
    .split(" ")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
  return stubPlace(
    name === "Houston" ? "Houston" : name,
    found.lat,
    found.lon,
    found.box
  );
}

function eachUtcDay(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime() && days.length < 800) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function installStubs(page: Page): Promise<void> {
  await page.route("**nominatim**", (route) => {
    const found = placeFor(route.request().url());
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([found]),
    });
  });
  await page.route("**DescribeDomains**", (route) => {
    const layer =
      new URL(route.request().url()).searchParams.get("LAYER") ?? "";
    const end = layer.includes("GLDAS") ? "2026-06-01" : "2026-07-01";
    return route.fulfill({
      contentType: "text/xml",
      body: `<Domain>2000-01-01/${end}/P1M</Domain>`,
    });
  });
  await page.route("**/archive-api.open-meteo.com/**", (route) => {
    const url = new URL(route.request().url());
    const lat = Number(url.searchParams.get("latitude"));
    const start = url.searchParams.get("start_date") ?? "2026-06-01";
    const end = url.searchParams.get("end_date") ?? "2026-06-30";
    const days = eachUtcDay(start, end);
    // September is a different rate, so a card that ignored the map month
    // would not read 6 mm/day.
    const rain = (day: string) => {
      if (day.startsWith("2026-09")) return 1;
      return lat > 30.1 ? 0.4 : 6;
    };
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        daily: {
          time: days,
          precipitation_sum: days.map(rain),
          temperature_2m_mean: days.map(() => 28),
        },
      }),
    });
  });
}

async function openHouston(page: Page): Promise<void> {
  await page.locator(".search__input").fill("Houston vs Austin rainfall 2026");
  const row = page.locator(".search__result", { hasText: "Houston vs Austin" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator(".place-compare.is-open")).toBeVisible();
  await expect(page.locator(".compare-pin--a")).toBeVisible();
  await expect(page.locator(".timeline__readout")).toHaveText("Jun 2026", {
    timeout: 15_000,
  });
}

async function pinLayout(page: Page) {
  return page.evaluate(() => {
    const pins = [...document.querySelectorAll(".compare-pin")].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        name: el.textContent ?? "",
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };
    });
    const card = document
      .querySelector(".place-compare")
      ?.getBoundingClientRect();
    const alt = Number(new URLSearchParams(location.hash.slice(1)).get("alt"));
    return {
      pins,
      card: card
        ? {
            left: card.left,
            right: card.right,
            top: card.top,
            bottom: card.bottom,
          }
        : null,
      width: window.innerWidth,
      height: window.innerHeight,
      alt,
    };
  });
}

test("compare card matches the map month and frames both cities", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installStubs(page);
  await page.goto("/");
  await awaitAppInteractive(page);
  await openHouston(page);

  const panel = page.locator(".place-compare.is-open");
  await expect(panel.locator(".place-compare__meta")).toContainText("Jun 2026");
  await expect(panel.locator(".place-compare__meta")).not.toContainText(
    "September"
  );
  await expect(panel.locator(".place-compare__sentence")).toContainText(
    "June 2026"
  );
  await expect(panel.locator(".place-compare__sentence")).toContainText(
    "more rain than Austin"
  );
  await expect(page.locator("#provenance")).toContainText("Jun 2026");
  await expect(panel.locator(".place-compare__map-note")).toBeHidden();
  await expect(panel.locator(".place-compare__primary").nth(0)).toContainText(
    "180 mm"
  );

  await expect
    .poll(async () => (await pinLayout(page)).alt, { timeout: 15_000 })
    .toBeLessThan(0.6);
  await awaitHashSettled(page);
  const framed = await pinLayout(page);
  expect(framed.pins).toHaveLength(2);
  expect(framed.alt).toBeLessThan(0.6);
  const gap = Math.hypot(
    framed.pins[0].x - framed.pins[1].x,
    framed.pins[0].y - framed.pins[1].y
  );
  expect(gap).toBeGreaterThan(framed.width * 0.12);
  const card = framed.card;
  expect(card).not.toBeNull();
  for (const pin of framed.pins) {
    const inside =
      card !== null &&
      pin.x > card.left &&
      pin.x < card.right &&
      pin.y > card.top &&
      pin.y < card.bottom;
    expect(inside).toBe(false);
  }

  await page.locator(".timeline__step").first().click();
  await expect(page.locator(".timeline__readout")).toHaveText("May 2026");
  await expect(panel.locator(".place-compare__meta")).toContainText("May 2026");
  await expect(page.locator("#provenance")).toContainText("May 2026");
  await expect(panel).toBeVisible();

  await page
    .locator(".search__input")
    .fill("Dallas vs San Antonio rainfall 2026");
  const next = page.locator(".search__result", {
    hasText: "Dallas vs San Antonio",
  });
  await expect(next).toBeVisible();
  await next.click();
  await expect(panel.locator(".place-compare__name").nth(0)).toContainText(
    "Dallas",
    { timeout: 15_000 }
  );
  await expect(page.locator(".timeline__readout")).toHaveText("Jun 2026");
  await expect(panel.locator(".place-compare__meta")).toContainText("Jun 2026");
  await expect(page.locator("#provenance")).toContainText("Jun 2026");

  await awaitHashSettled(page);
  await expect
    .poll(async () => page.evaluate(() => location.hash))
    .toMatch(/q=/);
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toMatch(/t=2026-06/);
  await page.goto(`/${hash}`);
  await awaitAppInteractive(page);
  const restored = page.locator(".place-compare.is-open");
  await expect(restored).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".timeline__readout")).toHaveText("Jun 2026", {
    timeout: 15_000,
  });
  await expect(restored.locator(".place-compare__meta")).toContainText(
    "Jun 2026"
  );
  await expect(page.locator("#provenance")).toContainText("Jun 2026");
  await expect(restored.locator(".place-compare__name").nth(0)).toContainText(
    "Dallas"
  );
});

test("a phone sheet leaves both compared cities in the open map", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await installStubs(page);
  await page.goto("/");
  await awaitAppInteractive(page);
  await openHouston(page);
  await expect
    .poll(async () => (await pinLayout(page)).alt, { timeout: 15_000 })
    .toBeLessThan(0.6);
  await awaitHashSettled(page);

  const panel = page.locator(".place-compare.is-open");
  await expect(panel.locator(".place-compare__meta")).toContainText("Jun 2026");
  await expect(page.locator(".timeline__readout")).toHaveText("Jun 2026");

  const framed = await pinLayout(page);
  expect(framed.alt).toBeLessThan(1);
  expect(framed.card).not.toBeNull();
  const card = framed.card;
  const gap = Math.hypot(
    framed.pins[0].x - framed.pins[1].x,
    framed.pins[0].y - framed.pins[1].y
  );
  expect(gap).toBeGreaterThan(framed.width * 0.1);
  for (const pin of framed.pins) {
    expect(pin.y).toBeGreaterThan(0);
    expect(pin.y).toBeLessThan(card?.top ?? 0);
    expect(pin.x).toBeGreaterThan(0);
    expect(pin.x).toBeLessThan(framed.width);
  }
});
