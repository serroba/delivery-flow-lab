export type Stage = {
  id: string;
  name: string;
  role: string;
  serviceHours: number;
  servers: number;
  touchMultiplier: number;
  arrivalCv2: number;
  serviceCv2: number;
};

export type WorkflowPreset = {
  id: string;
  name: string;
  description: string;
  stages: Stage[];
};

export type ScenarioState = {
  activePresetId: string;
  activeWorkstreams: number;
  handoffsPerWorkstreamPerWeek: number;
  workHoursPerDay: number;
  targetUtilization: number;
};

export type StageMetrics = {
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

export function sumSeries(limit: number, fn: (value: number) => number): number {
  let total = 0;
  for (let index = 0; index <= limit; index += 1) {
    total += fn(index);
  }
  return total;
}

export function factorial(value: number): number {
  let total = 1;
  for (let index = 2; index <= value; index += 1) {
    total *= index;
  }
  return total;
}

export function erlangC(
  arrivalRate: number,
  serviceRate: number,
  servers: number,
): number {
  if (servers < 1) {
    return Number.POSITIVE_INFINITY;
  }

  const traffic = arrivalRate / serviceRate;
  const utilization = traffic / servers;

  if (utilization >= 1) {
    return Number.POSITIVE_INFINITY;
  }

  const sum = sumSeries(
    servers - 1,
    (index) => (traffic ** index) / factorial(index),
  );
  const tail = (traffic ** servers) / (factorial(servers) * (1 - utilization));
  const p0 = 1 / (sum + tail);
  const probabilityOfWaiting = tail * p0;

  return probabilityOfWaiting / (servers * serviceRate - arrivalRate);
}

export function computeStageMetrics(
  stage: Stage,
  scenario: ScenarioState,
): StageMetrics {
  const baseArrivalPerDay =
    (scenario.activeWorkstreams * scenario.handoffsPerWorkstreamPerWeek) / 5;
  const arrivalPerDay = baseArrivalPerDay * stage.touchMultiplier;
  const arrivalPerHour = arrivalPerDay / scenario.workHoursPerDay;
  const serviceRate = 1 / stage.serviceHours;
  const capacityPerDay = stage.servers * serviceRate * scenario.workHoursPerDay;
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

export function safeConcurrencyFor(
  stage: Stage,
  scenario: ScenarioState,
): number {
  const perWorkstreamArrivalPerHour =
    ((scenario.handoffsPerWorkstreamPerWeek / 5) * stage.touchMultiplier) /
    scenario.workHoursPerDay;
  const serviceRate = 1 / stage.serviceHours;

  return (
    (scenario.targetUtilization * stage.servers * serviceRate) /
    perWorkstreamArrivalPerHour
  );
}

export function stageStatusLabel(utilization: number): string {
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
