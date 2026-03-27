import { describe, expect, it } from "vitest";

import {
  computeStageMetrics,
  erlangC,
  factorial,
  safeConcurrencyFor,
  stageStatusLabel,
  sumSeries,
  type ScenarioState,
  type Stage,
} from "../src/model";

const scenario: ScenarioState = {
  activePresetId: "balanced",
  activeWorkstreams: 4,
  handoffsPerWorkstreamPerWeek: 1.4,
  workHoursPerDay: 6.5,
  targetUtilization: 0.85,
};

const buildStage: Stage = {
  id: "build",
  name: "Build",
  role: "Implementation",
  serviceHours: 5.5,
  servers: 5,
  touchMultiplier: 1,
  arrivalCv2: 1.1,
  serviceCv2: 1.2,
};

describe("queue helpers", () => {
  it("computes factorial values", () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(5)).toBe(120);
  });

  it("sums integer series", () => {
    expect(sumSeries(3, (value) => value)).toBe(6);
  });

  it("returns an infinite wait time for unstable erlang C inputs", () => {
    expect(erlangC(3, 1, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("stage metrics", () => {
  it("computes stable stage metrics for a healthy multi-server stage", () => {
    const metrics = computeStageMetrics(buildStage, scenario);

    expect(metrics.stable).toBe(true);
    expect(metrics.arrivalPerDay).toBeCloseTo(1.12, 2);
    expect(metrics.capacityPerDay).toBeCloseTo(5.91, 2);
    expect(metrics.utilization).toBeCloseTo(0.19, 2);
    expect(metrics.queueHours).toBeCloseTo(0.0048, 4);
    expect(metrics.cycleHours).toBeCloseTo(5.5048, 4);
  });

  it("marks overloaded stages as unstable", () => {
    const overloadedScenario: ScenarioState = {
      ...scenario,
      activeWorkstreams: 30,
      handoffsPerWorkstreamPerWeek: 3,
    };

    const metrics = computeStageMetrics(
      {
        ...buildStage,
        servers: 1,
      },
      overloadedScenario,
    );

    expect(metrics.stable).toBe(false);
    expect(metrics.queueHours).toBe(Number.POSITIVE_INFINITY);
    expect(metrics.cycleHours).toBe(Number.POSITIVE_INFINITY);
  });

  it("estimates safe concurrency from the chosen guardrail", () => {
    expect(safeConcurrencyFor(buildStage, scenario)).toBeCloseTo(17.94, 2);
  });

  it("maps utilization to human-readable stage labels", () => {
    expect(stageStatusLabel(0.65)).toBe("Healthy");
    expect(stageStatusLabel(0.75)).toBe("Tight");
    expect(stageStatusLabel(0.9)).toBe("At risk");
    expect(stageStatusLabel(1.05)).toBe("Overloaded");
  });
});
