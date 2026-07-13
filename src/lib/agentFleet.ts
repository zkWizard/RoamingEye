export type AgentRunStatus = "passed" | "failed";

export interface FleetAgentStatus {
  id: string;
  label: string;
  status: AgentRunStatus;
  startedAt: string;
  completedAt: string;
  metrics: Record<string, number>;
  message?: string;
}

export interface FleetStatus {
  version: 1;
  completedAt: string;
  status: AgentRunStatus;
  agents: FleetAgentStatus[];
}

export interface FleetHistoryRun {
  completedAt: string;
  status: AgentRunStatus;
  discovered: number;
  review: number;
  verified: number;
  published: number;
}

export interface FleetHistory {
  version: 1;
  runs: FleetHistoryRun[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStatus(value: unknown): value is AgentRunStatus {
  return value === "passed" || value === "failed";
}

function isMetricMap(value: unknown): value is Record<string, number> {
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).every((metric) => typeof metric === "number")
  );
}

function isFleetAgent(value: unknown): value is FleetAgentStatus {
  if (!value || typeof value !== "object") return false;
  const agent = value as Record<string, unknown>;
  return (
    isNonEmptyString(agent.id) &&
    isNonEmptyString(agent.label) &&
    isStatus(agent.status) &&
    isNonEmptyString(agent.startedAt) &&
    isNonEmptyString(agent.completedAt) &&
    isMetricMap(agent.metrics) &&
    (agent.message === undefined || isNonEmptyString(agent.message))
  );
}

/** Parse the latest emitted run status before it reaches the operator view. */
export function parseFleetStatus(value: unknown): FleetStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Fleet status must be an object");
  }
  const status = value as Record<string, unknown>;
  if (
    status.version !== 1 ||
    !isNonEmptyString(status.completedAt) ||
    !isStatus(status.status) ||
    !Array.isArray(status.agents) ||
    !status.agents.every(isFleetAgent)
  ) {
    throw new Error("Fleet status is invalid");
  }
  return status as unknown as FleetStatus;
}

function isHistoryRun(value: unknown): value is FleetHistoryRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return (
    isNonEmptyString(run.completedAt) &&
    isStatus(run.status) &&
    ["discovered", "review", "verified", "published"].every(
      (field) => typeof run[field] === "number"
    )
  );
}

/** Parse the bounded history stream used for basic progress tracking. */
export function parseFleetHistory(value: unknown): FleetHistory {
  if (!value || typeof value !== "object") {
    throw new Error("Fleet history must be an object");
  }
  const history = value as Record<string, unknown>;
  if (
    history.version !== 1 ||
    !Array.isArray(history.runs) ||
    history.runs.length > 12 ||
    !history.runs.every(isHistoryRun)
  ) {
    throw new Error("Fleet history is invalid");
  }
  return history as unknown as FleetHistory;
}

export function metric(
  agent: FleetAgentStatus | undefined,
  key: string
): number {
  return agent?.metrics[key] ?? 0;
}
