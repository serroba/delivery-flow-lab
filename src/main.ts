import "./styles.css";

type Stage = {
  id: string;
  name: string;
  role: string;
  serviceHours: number;
  servers: number;
  touchMultiplier: number;
  arrivalCv2: number;
  serviceCv2: number;
};

type WorkflowPreset = {
  id: string;
  name: string;
  description: string;
  stages: Stage[];
};

type ScenarioState = {
  activePresetId: string;
  activeWorkstreams: number;
  handoffsPerWorkstreamPerWeek: number;
  workHoursPerDay: number;
  targetUtilization: number;
};

type StageMetrics = {
  arrivalPerDay: number;
  arrivalPerHour: number;
  capacityPerDay: number;
  utilization: number;
  queueHours: number;
  cycleHours: number;
  queueItems: number;
  totalItems: number;
  stable: boolean;
};

const presets: WorkflowPreset[] = [
  {
    id: "balanced",
    name: "Balanced Delivery",
    description: "A relatively healthy flow where code review and release are both active constraints.",
    stages: [
      { id: "shape", name: "Shape", role: "Scoping work for the next move", serviceHours: 1.2, servers: 2, touchMultiplier: 1, arrivalCv2: 1, serviceCv2: 0.8 },
      { id: "build", name: "Build", role: "Implementation and local verification", serviceHours: 5.5, servers: 5, touchMultiplier: 1, arrivalCv2: 1.1, serviceCv2: 1.2 },
      { id: "review", name: "Review", role: "PR review, revisions, and merge decisions", serviceHours: 1.8, servers: 2, touchMultiplier: 1.15, arrivalCv2: 1.2, serviceCv2: 0.9 },
      { id: "release", name: "Release", role: "CI, approvals, deployment windows, rollback checks", serviceHours: 1.5, servers: 1, touchMultiplier: 0.55, arrivalCv2: 1.4, serviceCv2: 1.1 },
    ],
  },
  {
    id: "review-heavy",
    name: "Review Drag",
    description: "Teams are shipping often, but review depth and rework are eating cycle time.",
    stages: [
      { id: "shape", name: "Shape", role: "Clarify intent and split work", serviceHours: 1, servers: 2, touchMultiplier: 1, arrivalCv2: 1, serviceCv2: 0.7 },
      { id: "build", name: "Build", role: "Implementation", serviceHours: 4.5, servers: 6, touchMultiplier: 1, arrivalCv2: 1.1, serviceCv2: 1.1 },
      { id: "review", name: "Review", role: "Deep review and re-review loops", serviceHours: 2.5, servers: 2, touchMultiplier: 1.35, arrivalCv2: 1.35, serviceCv2: 1.1 },
      { id: "release", name: "Release", role: "Deploy and verify", serviceHours: 1.2, servers: 1, touchMultiplier: 0.4, arrivalCv2: 1.1, serviceCv2: 0.8 },
    ],
  },
  {
    id: "release-bound",
    name: "Release Bottleneck",
    description: "Engineering can finish work, but deploy gates and release handling create the real queue.",
    stages: [
      { id: "shape", name: "Shape", role: "Scope and acceptance", serviceHours: 0.9, servers: 2, touchMultiplier: 1, arrivalCv2: 1, serviceCv2: 0.7 },
      { id: "build", name: "Build", role: "Implementation and tests", serviceHours: 4.2, servers: 6, touchMultiplier: 1, arrivalCv2: 1.1, serviceCv2: 1.1 },
      { id: "review", name: "Review", role: "Review and merge", serviceHours: 1.4, servers: 3, touchMultiplier: 1.05, arrivalCv2: 1.1, serviceCv2: 0.8 },
      { id: "release", name: "Release", role: "Release train, approvals, post-deploy checks", serviceHours: 2.4, servers: 1, touchMultiplier: 0.85, arrivalCv2: 1.5, serviceCv2: 1.3 },
    ],
  },
];

const state: ScenarioState = {
  activePresetId: presets[0].id,
  activeWorkstreams: 4,
  handoffsPerWorkstreamPerWeek: 1.4,
  workHoursPerDay: 6.5,
  targetUtilization: 0.85,
};

let stages = structuredClone(presets[0].stages);

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) {
    return "Unbounded";
  }

  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  }

  if (hours < 8) {
    return `${formatNumber(hours, 1)} h`;
  }

  return `${formatNumber(hours / 8, 1)} days`;
}

function sumSeries(limit: number, fn: (value: number) => number): number {
  let total = 0;
  for (let index = 0; index <= limit; index += 1) {
    total += fn(index);
  }
  return total;
}

function factorial(value: number): number {
  let total = 1;
  for (let index = 2; index <= value; index += 1) {
    total *= index;
  }
  return total;
}

function erlangC(arrivalRate: number, serviceRate: number, servers: number): number {
  if (servers < 1) {
    return Number.POSITIVE_INFINITY;
  }

  const traffic = arrivalRate / serviceRate;
  const utilization = traffic / servers;

  if (utilization >= 1) {
    return Number.POSITIVE_INFINITY;
  }

  const sum = sumSeries(servers - 1, (index) => (traffic ** index) / factorial(index));
  const tail = (traffic ** servers) / (factorial(servers) * (1 - utilization));
  const p0 = 1 / (sum + tail);
  const pw = tail * p0;

  return pw / (servers * serviceRate - arrivalRate);
}

function computeStageMetrics(stage: Stage): StageMetrics {
  const baseArrivalPerDay = (state.activeWorkstreams * state.handoffsPerWorkstreamPerWeek) / 5;
  const arrivalPerDay = baseArrivalPerDay * stage.touchMultiplier;
  const arrivalPerHour = arrivalPerDay / state.workHoursPerDay;
  const serviceRate = 1 / stage.serviceHours;
  const capacityPerDay = stage.servers * serviceRate * state.workHoursPerDay;
  const utilization = arrivalPerHour / (stage.servers * serviceRate);
  const stable = utilization < 1;

  if (!stable) {
    return {
      arrivalPerDay,
      arrivalPerHour,
      capacityPerDay,
      utilization,
      queueHours: Number.POSITIVE_INFINITY,
      cycleHours: Number.POSITIVE_INFINITY,
      queueItems: Number.POSITIVE_INFINITY,
      totalItems: Number.POSITIVE_INFINITY,
      stable,
    };
  }

  const mmcQueue = erlangC(arrivalPerHour, serviceRate, stage.servers);
  const variabilityFactor = (stage.arrivalCv2 + stage.serviceCv2) / 2;
  const queueHours = mmcQueue * variabilityFactor;
  const cycleHours = queueHours + stage.serviceHours;
  const queueItems = arrivalPerHour * queueHours;
  const totalItems = arrivalPerHour * cycleHours;

  return {
    arrivalPerDay,
    arrivalPerHour,
    capacityPerDay,
    utilization,
    queueHours,
    cycleHours,
    queueItems,
    totalItems,
    stable,
  };
}

function safeConcurrencyFor(stage: Stage): number {
  const perWorkstreamArrivalPerHour =
    ((state.handoffsPerWorkstreamPerWeek / 5) * stage.touchMultiplier) / state.workHoursPerDay;
  const serviceRate = 1 / stage.serviceHours;
  const maxWorkstreams = (state.targetUtilization * stage.servers * serviceRate) / perWorkstreamArrivalPerHour;
  return maxWorkstreams;
}

function stageStatusLabel(utilization: number): string {
  if (utilization >= 1) {
    return "Overloaded";
  }
  if (utilization >= 0.85) {
    return "At risk";
  }
  if (utilization >= 0.7) {
    return "Tight";
  }
  return "Healthy";
}

function bottleneckSummary(allMetrics: StageMetrics[]): { title: string; detail: string } {
  const paired = stages.map((stage, index) => ({ stage, metrics: allMetrics[index] }));
  const unstableStage = paired.find((entry) => !entry.metrics.stable);

  if (unstableStage) {
    return {
      title: `${unstableStage.stage.name} is saturated`,
      detail: `That queue is receiving work faster than it can clear it. Reduce concurrent work, add capacity, or lower touch frequency before optimizing anywhere else.`,
    };
  }

  const slowestQueue = paired.reduce((current, next) =>
    next.metrics.queueHours > current.metrics.queueHours ? next : current,
  );

  return {
    title: `${slowestQueue.stage.name} is the current constraint`,
    detail: `Most waiting time is accumulating here, so this is where attention will buy down cycle time first.`,
  };
}

function recommendationLines(allMetrics: StageMetrics[]): string[] {
  const paired = stages.map((stage, index) => ({ stage, metrics: allMetrics[index] }));
  const hottest = [...paired].sort((left, right) => right.metrics.utilization - left.metrics.utilization)[0];
  const safeLimit = Math.min(...stages.map((stage) => safeConcurrencyFor(stage)));
  const roundedSafeLimit = Math.max(1, Math.floor(safeLimit));
  const lines: string[] = [];

  if (hottest.stage.id === "review") {
    lines.push("Focus on code review policy, review staffing, or smaller changesets before increasing throughput.");
  } else if (hottest.stage.id === "release") {
    lines.push("Unblock release handling first. Faster coding will mostly create a larger ready-to-ship pile.");
  } else {
    lines.push(`The next improvement is upstream in ${hottest.stage.name.toLowerCase()}, not in downstream release operations.`);
  }

  if (state.activeWorkstreams > roundedSafeLimit) {
    lines.push(`Current workstream count is above the model's comfortable limit of about ${roundedSafeLimit}. Expect queues to grow quickly.`);
  } else {
    lines.push(`You can likely run about ${roundedSafeLimit} concurrent workstreams before any stage crosses the ${Math.round(state.targetUtilization * 100)}% risk line.`);
  }

  const totalCycle = allMetrics.reduce((sum, metrics) => sum + metrics.cycleHours, 0);
  const totalWait = allMetrics.reduce((sum, metrics) => sum + metrics.queueHours, 0);

  if (Number.isFinite(totalCycle) && totalCycle > 0) {
    lines.push(`${Math.round((totalWait / totalCycle) * 100)}% of total flow time is queueing rather than hands-on work in this scenario.`);
  }

  return lines;
}

function buildPresetButtons(): string {
  return presets
    .map(
      (preset) => `
        <button
          class="preset-button ${preset.id === state.activePresetId ? "is-active" : ""}"
          type="button"
          data-action="preset"
          data-preset-id="${preset.id}"
        >
          <strong>${preset.name}</strong>
          <span>${preset.description}</span>
        </button>
      `,
    )
    .join("");
}

function buildStageCard(stage: Stage, metrics: StageMetrics, index: number): string {
  const utilizationPct = metrics.utilization * 100;
  const safeConcurrency = Math.max(1, Math.floor(safeConcurrencyFor(stage)));
  const pressureWidth = `${Math.min(100, utilizationPct)}%`;

  return `
    <article class="stage-card ${metrics.stable ? "" : "is-unstable"}">
      <div class="stage-card__header">
        <div>
          <p class="eyebrow">Stage ${index + 1}</p>
          <h3>${stage.name}</h3>
        </div>
        <span class="status-pill">${stageStatusLabel(metrics.utilization)}</span>
      </div>
      <p class="stage-card__role">${stage.role}</p>

      <div class="metric-strip">
        <div>
          <span>Utilization</span>
          <strong>${Number.isFinite(utilizationPct) ? `${formatNumber(utilizationPct, 0)}%` : "∞"}</strong>
        </div>
        <div>
          <span>Queue wait</span>
          <strong>${formatDuration(metrics.queueHours)}</strong>
        </div>
        <div>
          <span>Total cycle</span>
          <strong>${formatDuration(metrics.cycleHours)}</strong>
        </div>
      </div>

      <div class="pressure-bar" aria-hidden="true">
        <span style="width: ${pressureWidth}"></span>
      </div>

      <dl class="facts">
        <div>
          <dt>Demand</dt>
          <dd>${formatNumber(metrics.arrivalPerDay, 2)} items/day</dd>
        </div>
        <div>
          <dt>Capacity</dt>
          <dd>${formatNumber(metrics.capacityPerDay, 2)} items/day</dd>
        </div>
        <div>
          <dt>Safe workstreams</dt>
          <dd>~${safeConcurrency}</dd>
        </div>
        <div>
          <dt>Queue length</dt>
          <dd>${Number.isFinite(metrics.queueItems) ? formatNumber(metrics.queueItems, 2) : "Unbounded"}</dd>
        </div>
      </dl>

      <div class="stage-editor">
        <label>
          Service hours
          <input type="number" min="0.1" step="0.1" data-stage-index="${index}" data-field="serviceHours" value="${stage.serviceHours}" />
        </label>
        <label>
          Parallel servers
          <input type="number" min="1" step="1" data-stage-index="${index}" data-field="servers" value="${stage.servers}" />
        </label>
        <label>
          Touch multiplier
          <input type="number" min="0.1" step="0.05" data-stage-index="${index}" data-field="touchMultiplier" value="${stage.touchMultiplier}" />
        </label>
        <label>
          Arrival CV²
          <input type="number" min="0.2" step="0.1" data-stage-index="${index}" data-field="arrivalCv2" value="${stage.arrivalCv2}" />
        </label>
        <label>
          Service CV²
          <input type="number" min="0.2" step="0.1" data-stage-index="${index}" data-field="serviceCv2" value="${stage.serviceCv2}" />
        </label>
      </div>
    </article>
  `;
}

function render(): void {
  const allMetrics = stages.map(computeStageMetrics);
  const flowSummary = bottleneckSummary(allMetrics);
  const totalCycle = allMetrics.reduce((sum, metrics) => sum + metrics.cycleHours, 0);
  const totalQueue = allMetrics.reduce((sum, metrics) => sum + metrics.queueHours, 0);
  const workstreamLimit = Math.max(1, Math.floor(Math.min(...stages.map((stage) => safeConcurrencyFor(stage)))));
  const recommendationText = recommendationLines(allMetrics);

  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <div class="hero__copy">
          <p class="eyebrow">Flow Lab</p>
          <h1>Explore where delivery queues really start to hurt.</h1>
          <p class="hero__lede">
            Model a product workflow from left to right, change concurrency and staffing, and see whether the next move is code review, release work, or simply carrying fewer things at once.
          </p>
        </div>

        <div class="summary-panel">
          <p class="eyebrow">Current read</p>
          <h2>${flowSummary.title}</h2>
          <p>${flowSummary.detail}</p>
          <div class="summary-stats">
            <div>
              <span>Total cycle time</span>
              <strong>${formatDuration(totalCycle)}</strong>
            </div>
            <div>
              <span>Total queue time</span>
              <strong>${formatDuration(totalQueue)}</strong>
            </div>
            <div>
              <span>Comfortable concurrency</span>
              <strong>${workstreamLimit} workstreams</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="controls">
        <div class="panel">
          <div class="panel__header">
            <p class="eyebrow">Workflow presets</p>
            <h2>Pick a starting shape</h2>
          </div>
          <div class="preset-grid">
            ${buildPresetButtons()}
          </div>
        </div>

        <div class="panel">
          <div class="panel__header">
            <p class="eyebrow">Scenario knobs</p>
            <h2>Set demand and your comfort line</h2>
          </div>
          <div class="scenario-grid">
            <label>
              Active workstreams
              <input type="range" min="1" max="12" step="1" data-scenario-field="activeWorkstreams" value="${state.activeWorkstreams}" />
              <strong>${state.activeWorkstreams}</strong>
            </label>
            <label>
              Handoffs per workstream per week
              <input type="range" min="0.4" max="3" step="0.1" data-scenario-field="handoffsPerWorkstreamPerWeek" value="${state.handoffsPerWorkstreamPerWeek}" />
              <strong>${formatNumber(state.handoffsPerWorkstreamPerWeek, 1)}</strong>
            </label>
            <label>
              Productive hours per day
              <input type="range" min="4" max="9" step="0.5" data-scenario-field="workHoursPerDay" value="${state.workHoursPerDay}" />
              <strong>${formatNumber(state.workHoursPerDay, 1)} h</strong>
            </label>
            <label>
              Utilization guardrail
              <input type="range" min="0.6" max="0.95" step="0.05" data-scenario-field="targetUtilization" value="${state.targetUtilization}" />
              <strong>${formatNumber(state.targetUtilization * 100, 0)}%</strong>
            </label>
          </div>
        </div>
      </section>

      <section class="insight-grid">
        ${recommendationText
          .map(
            (line, index) => `
              <article class="insight-card">
                <p class="eyebrow">Decision ${index + 1}</p>
                <p>${line}</p>
              </article>
            `,
          )
          .join("")}
      </section>

      <section class="flow-section">
        <div class="panel__header flow-section__header">
          <div>
            <p class="eyebrow">Sequential queues</p>
            <h2>Left-to-right view of work moving toward production</h2>
          </div>
          <p class="flow-note">Each stage uses an Allen-Cuneen style adjustment on top of multi-server queue waiting, so variability and staffing both change the story.</p>
        </div>

        <div class="flow-lane">
          ${stages
            .map((stage, index) => {
              const card = buildStageCard(stage, allMetrics[index], index);
              const arrow = index < stages.length - 1 ? '<div class="flow-arrow" aria-hidden="true">→</div>' : "";
              return `${card}${arrow}`;
            })
            .join("")}
        </div>
      </section>
    </main>
  `;

  bindInteractions();
}

function bindInteractions(): void {
  app.querySelectorAll<HTMLElement>("[data-action='preset']").forEach((button) => {
    button.addEventListener("click", () => {
      const presetId = button.dataset.presetId;
      const preset = presets.find((entry) => entry.id === presetId);

      if (!preset) {
        return;
      }

      state.activePresetId = preset.id;
      stages = structuredClone(preset.stages);
      render();
    });
  });

  app.querySelectorAll<HTMLInputElement>("[data-scenario-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const field = input.dataset.scenarioField as keyof ScenarioState;
      state[field] = Number(input.value) as never;
      render();
    });
  });

  app.querySelectorAll<HTMLInputElement>("[data-stage-index]").forEach((input) => {
    input.addEventListener("input", () => {
      const stageIndex = Number(input.dataset.stageIndex);
      const field = input.dataset.field as keyof Stage;
      const rawValue = Number(input.value);

      if (!Number.isFinite(stageIndex) || !field) {
        return;
      }

      if (field === "servers") {
        stages[stageIndex][field] = clamp(Math.round(rawValue), 1, 20) as never;
      } else {
        stages[stageIndex][field] = clamp(rawValue, 0.1, 100) as never;
      }

      render();
    });
  });
}

render();
