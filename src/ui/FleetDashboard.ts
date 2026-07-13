import {
  metric,
  parseFleetHistory,
  parseFleetStatus,
  type FleetAgentStatus,
  type FleetHistory,
  type FleetHistoryRun,
  type FleetStatus,
} from "../lib/agentFleet";
import { ICONS } from "./icons";
import { FocusTrap } from "./modal";

const REVIEW_QUEUE_URL =
  "https://github.com/zkWizard/RoamingEye/blob/main/catalog/review-queue.json";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMetricName(value: string): string {
  return value.replace(/-/g, " ");
}

function agentMetrics(agent: FleetAgentStatus): string {
  const values = Object.entries(agent.metrics);
  if (values.length === 0) return "No numeric output";
  return values
    .map(([name, value]) => `${value} ${formatMetricName(name)}`)
    .join(" · ");
}

/**
 * Read-only operational view of the committed catalog-agent artifacts. Human
 * review stays in GitHub; this makes the automated handoffs easy to see.
 */
export class FleetDashboard {
  private readonly container: HTMLElement;
  private readonly trap = new FocusTrap();
  private readonly summary: HTMLElement;
  private readonly agents: HTMLElement;
  private readonly history: HTMLOListElement;
  private readonly status: HTMLElement;
  private data: { status: FleetStatus; history: FleetHistory } | null = null;
  private loading: Promise<void> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    container.classList.add("providers", "fleet");
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-modal", "true");
    container.setAttribute("aria-label", "Catalog agent fleet status");
    container.innerHTML = `
      <div class="providers__backdrop"></div>
      <div class="providers__panel fleet__panel">
        <header class="providers__header">
          <div>
            <h2 class="providers__title fleet__title">Fleet status</h2>
            <p class="providers__intro">Six review-gated catalog agents keep
              the software finder current. Editorial approval remains human.</p>
          </div>
          <button class="providers__close" type="button" aria-label="Close">${ICONS.close}</button>
        </header>
        <div class="providers__body fleet__body">
          <p class="fleet__status" aria-live="polite">Loading latest fleet run...</p>
          <section class="fleet__summary" aria-label="Fleet summary"></section>
          <section class="fleet__agents" aria-label="Agent progress"></section>
          <section class="fleet__history-panel" aria-labelledby="fleet-history-heading">
            <h3 id="fleet-history-heading" class="fleet__section-title">Latest 12 runs</h3>
            <ol class="fleet__history"></ol>
          </section>
        </div>
        <footer class="providers__legend">
          <a href="${REVIEW_QUEUE_URL}" target="_blank" rel="noopener">Open review queue</a>
          <span class="providers__version">RoamingEye v${__APP_VERSION__}</span>
        </footer>
      </div>`;

    this.summary = container.querySelector(".fleet__summary") as HTMLElement;
    this.agents = container.querySelector(".fleet__agents") as HTMLElement;
    this.history = container.querySelector(
      ".fleet__history"
    ) as HTMLOListElement;
    this.status = container.querySelector(".fleet__status") as HTMLElement;

    (
      container.querySelector(".providers__close") as HTMLButtonElement
    ).addEventListener("click", () => this.close());
    (
      container.querySelector(".providers__backdrop") as HTMLElement
    ).addEventListener("click", () => this.close());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });
  }

  open(): void {
    this.container.classList.add("is-open");
    this.container.setAttribute("aria-hidden", "false");
    this.trap.activate(
      this.container.querySelector(".fleet__panel") as HTMLElement
    );
    void this.ensureData();
  }

  close(): void {
    if (!this.container.classList.contains("is-open")) return;
    this.container.classList.remove("is-open");
    this.container.setAttribute("aria-hidden", "true");
    this.trap.deactivate();
  }

  private async ensureData(): Promise<void> {
    if (this.data) return;
    if (!this.loading) {
      this.loading = Promise.all([
        fetch("data/agent-status.json"),
        fetch("data/agent-history.json"),
      ])
        .then(async ([statusResponse, historyResponse]) => {
          if (!statusResponse.ok || !historyResponse.ok) {
            throw new Error("Fleet artifacts are unavailable");
          }
          const [status, history] = await Promise.all([
            statusResponse.json(),
            historyResponse.json(),
          ]);
          this.data = {
            status: parseFleetStatus(status),
            history: parseFleetHistory(history),
          };
          this.render();
        })
        .catch(() => {
          this.status.textContent =
            "The latest fleet report is unavailable right now.";
        });
    }
    await this.loading;
  }

  private render(): void {
    if (!this.data) return;
    const { status, history } = this.data;
    this.status.textContent = `Last run ${status.status} · ${formatDate(status.completedAt)}`;
    this.renderSummary(status);
    this.renderAgents(status.agents);
    this.renderHistory(history.runs);
  }

  private renderSummary(status: FleetStatus): void {
    const scout = status.agents.find((agent) => agent.id === "scout");
    const verifier = status.agents.find((agent) => agent.id === "verifier");
    const builder = status.agents.find(
      (agent) => agent.id === "experience-builder"
    );
    const values = [
      ["Run", status.status],
      ["Discovered", String(metric(scout, "added"))],
      ["Needs review", String(metric(verifier, "review"))],
      ["Published", String(metric(builder, "published"))],
    ];
    this.summary.replaceChildren(
      ...values.map(([label, value]) =>
        this.summaryItem(label, value, status.status)
      )
    );
  }

  private summaryItem(
    label: string,
    value: string,
    status: FleetStatus["status"]
  ): HTMLElement {
    const item = document.createElement("div");
    item.className = "fleet__summary-item";
    const metric = document.createElement("strong");
    metric.className = `fleet__summary-value fleet__summary-value--${status}`;
    metric.textContent = value;
    const caption = document.createElement("span");
    caption.textContent = label;
    item.append(metric, caption);
    return item;
  }

  private renderAgents(agents: FleetAgentStatus[]): void {
    this.agents.replaceChildren(
      ...agents.map((agent) => this.agentItem(agent))
    );
  }

  private agentItem(agent: FleetAgentStatus): HTMLElement {
    const item = document.createElement("article");
    item.className = "fleet__agent";

    const heading = document.createElement("h3");
    heading.className = "fleet__agent-name";
    heading.textContent = agent.label;
    const state = document.createElement("span");
    state.className = `fleet__agent-state fleet__agent-state--${agent.status}`;
    state.textContent = agent.status;
    const metrics = document.createElement("p");
    metrics.className = "fleet__agent-metrics";
    metrics.textContent = agentMetrics(agent);
    item.append(heading, state, metrics);

    if (agent.message) {
      const message = document.createElement("p");
      message.className = "fleet__agent-message";
      message.textContent = agent.message;
      item.append(message);
    }
    return item;
  }

  private renderHistory(runs: FleetHistoryRun[]): void {
    this.history.replaceChildren();
    if (runs.length === 0) {
      const empty = document.createElement("li");
      empty.className = "fleet__history-empty";
      empty.textContent = "No completed fleet runs have been recorded yet.";
      this.history.appendChild(empty);
      return;
    }
    for (const run of runs) {
      const item = document.createElement("li");
      item.className = "fleet__history-item";
      const completed = document.createElement("time");
      completed.dateTime = run.completedAt;
      completed.textContent = formatDate(run.completedAt);
      const result = document.createElement("span");
      result.className = `fleet__history-status fleet__history-status--${run.status}`;
      result.textContent = run.status;
      const metrics = document.createElement("span");
      metrics.className = "fleet__history-metrics";
      metrics.textContent = `${run.published} published · ${run.review} review · ${run.discovered} discovered`;
      item.append(completed, result, metrics);
      this.history.appendChild(item);
    }
  }
}
