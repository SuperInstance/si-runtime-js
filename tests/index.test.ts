import {
  ConservationBudget,
  SpectralRanker,
  CapabilityScanner,
  Cell,
  Agent,
} from '../src/index';

// ─── Conservation Budget ─────────────────────────────────────────────

describe('ConservationBudget', () => {
  test('test_budget_allocation', () => {
    const budget = new ConservationBudget(100);
    budget.allocate(70, 30);
    const audit = budget.audit();
    expect(audit.gamma).toBe(70);
    expect(audit.eta).toBe(30);
    expect(audit.C).toBe(100);
    expect(audit.utilization).toBeCloseTo(0.7);
  });

  test('test_budget_transfer', () => {
    const budget = new ConservationBudget(100);
    budget.allocate(60, 40);
    budget.transfer('gamma', 'eta', 10);
    const audit = budget.audit();
    expect(audit.gamma).toBe(50);
    expect(audit.eta).toBe(50);
    // Conservation: total still equals C
    expect(audit.gamma + audit.eta).toBe(100);
  });

  test('test_budget_conservation_violation', () => {
    const budget = new ConservationBudget(100);
    expect(() => budget.allocate(50, 40)).toThrow('Conservation violation');
    expect(() => new ConservationBudget(-1)).toThrow('positive');
    expect(() => budget.allocate(-1, 101)).toThrow('non-negative');
  });

  test('budget spend and audit', () => {
    const budget = new ConservationBudget(100);
    budget.allocate(80, 20);
    budget.spend(30);
    const audit = budget.audit();
    expect(audit.gamma).toBe(50);
    expect(audit.eta).toBe(50);
  });

  test('budget serialization round-trip', () => {
    const budget = new ConservationBudget(200);
    budget.allocate(150, 50);
    const json = budget.toJSON();
    const restored = ConservationBudget.fromJSON(json);
    expect(restored.audit()).toEqual(budget.audit());
  });
});

// ─── Spectral Ranker ─────────────────────────────────────────────────

describe('SpectralRanker', () => {
  test('test_spectral_rank', () => {
    const ranker = new SpectralRanker();
    // Symmetric positive definite matrix
    const matrix = [
      [4, 1],
      [1, 3],
    ];
    const result = ranker.rank(matrix);
    expect(result.eigenvalues.length).toBeGreaterThanOrEqual(1);
    expect(result.ranking.length).toBe(2);
    // Rankings should sum to ~1 (normalized eigenvector)
    const sumSq = result.ranking.reduce((s, v) => s + v * v, 0);
    expect(sumSq).toBeCloseTo(1, 5);
  });

  test('test_spectral_condition', () => {
    const ranker = new SpectralRanker();
    // Identity matrix has condition number ~1
    const identity = [
      [1, 0],
      [0, 1],
    ];
    const cond = ranker.conditionNumber(identity);
    expect(cond).toBeCloseTo(1, 1);
  });

  test('test_spectral_topK', () => {
    const ranker = new SpectralRanker();
    const matrix = [
      [10, 1, 0],
      [1, 5, 1],
      [0, 1, 2],
    ];
    const top2 = ranker.topK(matrix, 2);
    expect(top2.length).toBe(2);
    expect(top2[0]).toBe(0); // strongest row
  });

  test('spectral rejects non-square matrix', () => {
    const ranker = new SpectralRanker();
    expect(() => ranker.rank([[1, 2]])).toThrow('square');
  });
});

// ─── Capability Scanner ──────────────────────────────────────────────

describe('CapabilityScanner', () => {
  const scanner = new CapabilityScanner();

  const tomlA = `
[capability]
name = "alpha"
layer = "core"
provides = ["compute", "transform"]
requires = ["memory"]
integrates = { beta = "shared-bus" }
`;

  const tomlB = `
[capability]
name = "beta"
layer = "peripheral"
provides = ["memory", "storage"]
requires = ["compute"]
`;

  const tomlC = `
[capability]
name = "gamma"
layer = "io"
provides = ["network"]
requires = ["storage"]
`;

  test('test_capability_parse', () => {
    const manifest = scanner.parse(tomlA);
    expect(manifest.name).toBe('alpha');
    expect(manifest.layer).toBe('core');
    expect(manifest.provides).toEqual(['compute', 'transform']);
    expect(manifest.requires).toEqual(['memory']);
    expect(manifest.integrates).toEqual({ beta: 'shared-bus' });
  });

  test('test_capability_scan', () => {
    const manifests = scanner.scanDir([tomlA, tomlB]);
    expect(manifests.length).toBe(2);
    expect(manifests[0].name).toBe('alpha');
    expect(manifests[1].name).toBe('beta');
  });

  test('test_capability_integrations', () => {
    const a = scanner.parse(tomlA);
    const b = scanner.parse(tomlB);
    const c = scanner.parse(tomlC);
    const suggestions = scanner.findIntegrations([a, b, c]);

    expect(suggestions.length).toBeGreaterThan(0);
    // alpha provides "compute" which beta requires
    const alphaToBeta = suggestions.find(s => s.from === 'alpha' && s.to === 'beta');
    expect(alphaToBeta).toBeTruthy();
    // beta provides "memory" which alpha requires
    const betaToAlpha = suggestions.find(s => s.from === 'beta' && s.to === 'alpha');
    expect(betaToAlpha).toBeTruthy();
    // Explicit integrates: alpha -> beta
    const explicit = suggestions.find(s => s.reason.includes('Explicit'));
    expect(explicit).toBeTruthy();
    expect(explicit!.priority).toBe(10);
  });
});

// ─── Cell ────────────────────────────────────────────────────────────

describe('Cell', () => {
  test('test_cell_create', () => {
    const budget = new ConservationBudget(100);
    budget.allocate(80, 20);
    const cell = new Cell('adder', budget, (x: number) => x + 1);
    expect(cell.name).toBe('adder');
    expect(cell.getDeps()).toEqual([]);
  });

  test('test_cell_execute', () => {
    const budget = new ConservationBudget(100);
    budget.allocate(80, 20);
    const cell = new Cell('doubler', budget, (x: number) => x * 2);
    const result = cell.execute(5);
    expect(result.output).toBe(10);
    expect(result.cost).toBe(1);
    expect(result.budgetRemaining).toBe(79);
  });

  test('test_cell_compose', () => {
    const budget1 = new ConservationBudget(100);
    budget1.allocate(80, 20);
    const budget2 = new ConservationBudget(100);
    budget2.allocate(80, 20);

    const addOne = new Cell('addOne', budget1, (x: number) => x + 1);
    const double = new Cell('double', budget2, (x: number) => x * 2);
    double.addDep('addOne');

    const pipeline = addOne.compose(double);
    expect(pipeline.name).toBe('addOne>double');
    const result = pipeline.execute(5);
    // (5 + 1) * 2 = 12
    expect(result.output).toBe(12);
  });

  test('test_cell_budget_enforcement', () => {
    const budget = new ConservationBudget(10);
    budget.allocate(2, 8);
    const cell = new Cell('expensive', budget, () => 'result');
    // First execution costs 1, leaving 1
    cell.execute(null);
    // Second execution costs 1, leaving 0
    cell.execute(null);
    // Third should fail
    expect(() => cell.execute(null)).toThrow('budget exhausted');
  });
});

// ─── Agent ───────────────────────────────────────────────────────────

describe('Agent', () => {
  function makeAgent(): { agent: Agent; budget: ConservationBudget } {
    const budget = new ConservationBudget(1000);
    budget.allocate(800, 200);
    const agent = new Agent(budget, [
      { name: 'compute', weight: 0.8 },
      { name: 'transform', weight: 0.5 },
      { name: 'store', weight: 0.3 },
    ]);
    return { agent, budget };
  }

  test('test_agent_lifecycle', () => {
    const { agent } = makeAgent();
    expect(agent.getState()).toBe('IDLE');
    agent.transition('THINKING');
    expect(agent.getState()).toBe('THINKING');
    agent.transition('IDLE');
    expect(agent.getState()).toBe('IDLE');
  });

  test('test_agent_decide', () => {
    const { agent } = makeAgent();
    const action = agent.decide('process data');
    expect(action.capability).toBeTruthy();
    expect(typeof action.confidence).toBe('number');
    expect(action.estimatedCost).toBeGreaterThan(0);
    // 'compute' has highest weight so should be chosen
    expect(action.capability).toBe('compute');
  });

  test('test_agent_learn', () => {
    const { agent } = makeAgent();
    // First decide+learn cycle
    const action1 = agent.decide('task1');
    agent.learn({ reward: 0.5, cost: 5 });

    // Second cycle — weight should have increased
    const capsBefore = agent.getCapabilities();
    const capName = action1.capability;
    const weightBefore = capsBefore.find(c => c.name === capName)!.weight;

    agent.decide('task2');
    agent.learn({ reward: 1.0, cost: 3 });

    const capsAfter = agent.getCapabilities();
    const weightAfter = capsAfter.find(c => c.name === capName)!.weight;
    expect(weightAfter).toBeGreaterThan(weightBefore);
    expect(agent.getState()).toBe('IDLE');
  });

  test('test_agent_serialization', () => {
    const { agent } = makeAgent();
    agent.decide('task');
    agent.learn({ reward: 0.5, cost: 3 });

    const json = agent.toJSON();
    expect(json.state).toBe('IDLE');
    expect(json.capabilities.length).toBe(3);
    expect(json.spectralIdentity.length).toBe(3);

    const restored = Agent.fromJSON(json);
    expect(restored.getState()).toBe('IDLE');
    expect(restored.getCapabilities().length).toBe(3);
  });
});
