import { describe, expect, it } from "vitest";
import {
  metric,
  parseFleetHistory,
  parseFleetStatus,
  type FleetStatus,
} from "./agentFleet";

const status: FleetStatus = {
  version: 1,
  completedAt: "2026-07-12T00:00:00.000Z",
  status: "passed",
  agents: [
    {
      id: "scout",
      label: "Scout",
      status: "passed",
      startedAt: "2026-07-12T00:00:00.000Z",
      completedAt: "2026-07-12T00:00:01.000Z",
      metrics: { added: 3 },
    },
  ],
};

describe("agent fleet artifacts", () => {
  it("parses a valid latest status", () => {
    expect(parseFleetStatus(status)).toEqual(status);
  });

  it("rejects malformed status entries", () => {
    expect(() => parseFleetStatus({ ...status, agents: [{}] })).toThrow(
      "Fleet status is invalid"
    );
  });

  it("parses a bounded history", () => {
    expect(
      parseFleetHistory({
        version: 1,
        runs: [
          {
            completedAt: "2026-07-12T00:00:00.000Z",
            status: "passed",
            discovered: 3,
            review: 8,
            verified: 4,
            published: 4,
          },
        ],
      }).runs
    ).toHaveLength(1);
  });

  it("reads missing metrics as zero", () => {
    expect(metric(status.agents[0], "published")).toBe(0);
  });
});
