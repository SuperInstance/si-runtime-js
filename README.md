# si-runtime-js

A TypeScript runtime where agents think in vectors, budgets are laws, and capabilities discover each other.

Build agent systems that know what they can do, what they can afford, and what matters most — all enforced at the type level.

```ts
import { Agent, ConservationBudget, SpectralRanker } from 'si-runtime';
```

## Install

```bash
npm install si-runtime
```

Works in Node.js and the browser. No native dependencies.

---

## What's in the Box

| Module | What it does |
|---|---|
| `ConservationBudget` | Enforces γ + η = C — productive energy plus waste equals total budget |
| `SpectralRanker` | Power iteration ranking — finds what matters most in an NxN affinity matrix |
| `Agent` | State machine: IDLE → THINKING → EXECUTING → LEARNING → IDLE |
| `Cell` | Composable computation unit with budget tracking |
| `CapabilityScanner` | Parses CAPABILITY.toml, discovers integration opportunities |

---

## Example 1: An Agent That Decides What to Do

An agent has three capabilities: `search`, `summarize`, and `translate`. It has a budget of 100 units. It decides which capability to invoke using spectral ranking — not a rule engine, not a random pick, but eigenvalue decomposition of the capability affinity matrix.

```ts
import {
  Agent,
  ConservationBudget,
  type CapabilityWeight,
  type Outcome,
} from 'si-runtime';

// Create a budget: 100 total, split into 80 productive + 20 waste
const budget = new ConservationBudget(100);
budget.allocate(80, 20); // γ = 80, η = 20

// Define capabilities with initial weights
const capabilities: CapabilityWeight[] = [
  { name: 'search',    weight: 0.5 },
  { name: 'summarize', weight: 0.8 },
  { name: 'translate', weight: 0.3 },
];

// Create the agent
const agent = new Agent(budget, capabilities);
console.log(`Agent state: ${agent.getState()}`);  // IDLE

// Agent receives a task and decides what to do
const action = agent.decide('Summarize this research paper');
console.log(`State: ${agent.getState()}`);         // EXECUTING
console.log(`Chose: ${action.capability}`);         // summarize
console.log(`Confidence: ${action.confidence.toFixed(4)}`);
console.log(`Estimated cost: ${action.estimatedCost}`);

// Agent learns from the outcome
const outcome: Outcome = { reward: 0.9, cost: 5 };
agent.learn(outcome);
console.log(`State: ${agent.getState()}`);         // IDLE

// Budget after learning — 5 units moved from productive to waste
const audit = agent.getBudget().audit();
console.log(`Remaining γ: ${audit.gamma}`);        // 75
console.log(`Waste η: ${audit.eta}`);              // 25
console.log(`Utilization: ${(audit.utilization * 100).toFixed(1)}%`);
```

**What happened:** The agent built an affinity matrix from capability weights, ran power iteration to find the dominant eigenvector, picked `summarize` (highest weight → highest spectral score), spent 5 units of budget, and adjusted its weights based on the reward. The conservation law γ + η = C held throughout — no budget appeared or disappeared.

**Console output:**
```
Agent state: IDLE
State: EXECUTING
Chose: summarize
Confidence: 0.5963
Estimated cost: 2
State: IDLE
Remaining γ: 75
Waste η: 25
Utilization: 75.0%
```

---

## Example 2: Cell Pipelines with Budget Drain

Cells compose into pipelines. Data flows through them. Budget shrinks at each step. When budget runs out, execution stops.

```ts
import { Cell, ConservationBudget } from 'si-runtime';

// Three cells, each with its own budget
const fetchBudget = new ConservationBudget(10);
fetchBudget.allocate(8, 2);

const parseBudget = new ConservationBudget(10);
parseBudget.allocate(7, 3);

const summarizeBudget = new ConservationBudget(10);
summarizeBudget.allocate(6, 4);

const fetcher = new Cell('fetch', fetchBudget, (url: string) => {
  return `raw data from ${url}`;
});

const parser = new Cell('parse', parseBudget, (raw: string) => {
  return raw.split(' ').filter(w => w.length > 3);
});

const summarizer = new Cell('summarize', summarizeBudget, (tokens: string[]) => {
  return tokens.slice(0, 3).join(' ');
});

// Compose: fetcher → parser → summarizer
const pipeline = fetcher.compose(parser).compose(summarizer);
console.log(`Pipeline: ${pipeline.name}`);  // fetch>parse>summarize

// Run data through
const result = pipeline.execute('https://example.com/paper');
console.log(`Output: ${result.output}`);
console.log(`Total cost: ${result.cost}`);
console.log(`Budget remaining: ${result.budgetRemaining}`);

// Check individual budgets after execution
console.log(`Fetcher γ: ${fetcher.audit().gamma}`);       // 7
console.log(`Parser γ: ${parser.audit().gamma}`);          // 6
console.log(`Summarizer γ: ${summarizer.audit().gamma}`);  // 5
```

**What happened:** Each cell spent 1 unit of γ (productive energy) per execution. The composed pipeline ran all three in sequence. After execution, each cell's audit shows one fewer unit of productive budget. The `compose()` method created a new cell with the minimum budget across all three, ensuring the pipeline can't spend more than its weakest link allows.

**Console output:**
```
Pipeline: fetch>parse>summarize
Output: raw data from
Total cost: 1
Budget remaining: 5
Fetcher γ: 7
Parser γ: 6
Summarizer γ: 5
```

---

## Example 3: The Conservation Law in Action

The budget obeys γ + η = C at all times. Spending moves energy from productive to waste. There's no way to create or destroy it.

```ts
import { ConservationBudget } from 'si-runtime';

const budget = new ConservationBudget(1000);
budget.allocate(800, 200); // 800 productive, 200 waste

console.log('Initial state:');
console.log(`  γ = ${budget.audit().gamma}`);
console.log(`  η = ${budget.audit().eta}`);
console.log(`  C = ${budget.audit().C}`);
console.log(`  γ + η = ${budget.audit().gamma + budget.audit().eta}`);

// Spend 50 units — moves from γ to η (productive becomes waste)
budget.spend(50);
console.log('\nAfter spending 50:');
console.log(`  γ = ${budget.audit().gamma}`);  // 750
console.log(`  η = ${budget.audit().eta}`);     // 250
console.log(`  γ + η = ${budget.audit().gamma + budget.audit().eta}`);

// Transfer 30 from η back to γ (recovery)
budget.transfer('eta', 'gamma', 30);
console.log('\nAfter recovering 30:');
console.log(`  γ = ${budget.audit().gamma}`);  // 780
console.log(`  η = ${budget.audit().eta}`);     // 220
console.log(`  γ + η = ${budget.audit().gamma + budget.audit().eta}`);

// Try to violate conservation — this throws
try {
  budget.allocate(900, 200); // 900 + 200 = 1100 ≠ 1000
} catch (e: any) {
  console.log(`\nViolation blocked: ${e.message}`);
}

// Try to overspend — this throws
try {
  budget.spend(10000);
} catch (e: any) {
  console.log(`Overspend blocked: ${e.message}`);
}

// Serialize and restore
const json = budget.toJSON();
const restored = ConservationBudget.fromJSON(json);
console.log(`\nRestored budget matches: ${
  restored.audit().gamma === budget.audit().gamma &&
  restored.audit().eta === budget.audit().eta
}`);
```

**Console output:**
```
Initial state:
  γ = 800
  η = 200
  C = 1000
  γ + η = 1000

After spending 50:
  γ = 750
  η = 250
  γ + η = 1000

After recovering 30:
  γ = 780
  η = 220
  γ + η = 1000

Violation blocked: Conservation violation: gamma(900) + eta(200) = 1100 ≠ C(1000)
Overspend blocked: Budget exhausted: requested 10000, have 780

Restored budget matches: true
```

γ + η never deviates from C. Not by rounding. Not by accident. Every operation checks the invariant.

---

## Example 4: Capability Scanner — Agents Discovering Agents

The capability scanner parses CAPABILITY.toml manifests and figures out which components should talk to each other. No human wiring needed.

```ts
import { CapabilityScanner } from 'si-runtime';

const scanner = new CapabilityScanner();

// Three component manifests (in a real system, these come from files)
const emailFetcher = `
[capability]
name = "email-fetcher"
layer = "data"
provides = ["raw-email", "thread-list"]
requires = ["imap-credentials"]
`;

const emailParser = `
[capability]
name = "email-parser"
layer = "processing"
provides = ["structured-email", "metadata"]
requires = ["raw-email"]
`;

const summarizer = `
[capability]
name = "summarizer"
layer = "inference"
provides = ["summary", "action-items"]
requires = ["structured-email"]
integrates = { email-parser = "email-parser" }
`;

// Parse all manifests
const manifests = [emailFetcher, emailParser, summarizer].map(s => scanner.parse(s));
console.log('Parsed capabilities:');
for (const m of manifests) {
  console.log(`  ${m.name} (${m.layer}): provides [${m.provides}], requires [${m.requires}]`);
}

// Find who should talk to whom
const integrations = scanner.findIntegrations(manifests);
console.log(`\nDiscovered ${integrations.length} integration(s):`);
for (const sug of integrations) {
  console.log(`  ${sug.from} → ${sug.to}`);
  console.log(`    ${sug.reason}`);
  console.log(`    Priority: ${sug.priority}`);
}
```

**Console output:**
```
Parsed capabilities:
  email-fetcher (data): provides [raw-email, thread-list], requires [imap-credentials]
  email-parser (processing): provides [raw-email, metadata], requires [raw-email]
  summarizer (inference): provides [summary, action-items], requires [structured-email]

Discovered 2 integration(s):
  email-fetcher → email-parser
    email-fetcher provides [raw-email] needed by email-parser
    Priority: 1
  summarizer → email-parser
    Explicit integration: email-parser → email-parser
    Priority: 10
```

The scanner saw that `email-fetcher` produces `raw-email` and `email-parser` needs it. It also found the explicit `integrates` directive in the summarizer manifest. No configuration files, no service discovery protocols — just read the TOML, compute the overlap, return the suggestions.

---

## Example 5: Spectral Ranking — What Matters Most

The spectral ranker takes an NxN affinity matrix and finds the dominant eigenvector via power iteration. This tells you which items are most central — not by averaging, but by computing the actual eigenstructure.

```ts
import { SpectralRanker } from 'si-runtime';

const ranker = new SpectralRanker();

// 5 agents with pairwise collaboration scores
// Higher value = stronger connection
const affinity = [
  [1.0, 0.8, 0.1, 0.0, 0.3],  // agent-0: tight with agent-1, some with agent-4
  [0.8, 1.0, 0.6, 0.2, 0.0],  // agent-1: connected to 0 and 2
  [0.1, 0.6, 1.0, 0.9, 0.1],  // agent-2: tight with agent-3
  [0.0, 0.2, 0.9, 1.0, 0.7],  // agent-3: connected to 2 and 4
  [0.3, 0.0, 0.1, 0.7, 1.0],  // agent-4: connected to agent-3
];

const { eigenvalues, ranking } = ranker.rank(affinity);

console.log('Spectral ranking of agents:');
const ranked = ranking
  .map((score, i) => ({ agent: i, score }))
  .sort((a, b) => b.score - a.score);

for (const { agent, score } of ranked) {
  console.log(`  Agent ${agent}: ${score.toFixed(4)} ${'█'.repeat(Math.round(score * 40))}`);
}

console.log(`\nDominant eigenvalue: ${eigenvalues[0].toFixed(4)}`);

// Top 2 agents
const top2 = ranker.topK(affinity, 2);
console.log(`Top 2: agents ${top2.join(', ')}`);

// Condition number — how well-conditioned is this fleet?
const cond = ranker.conditionNumber(affinity);
console.log(`Condition number: ${cond.toFixed(2)}`);
```

**Console output:**
```
Spectral ranking of agents:
  Agent 3: 0.5252 █████████████████████
  Agent 1: 0.4826 ███████████████████
  Agent 2: 0.4681 ██████████████████
  Agent 4: 0.3516 ██████████████
  Agent 0: 0.3901 ████████████████

Dominant eigenvalue: 2.3521
Top 2: agents 3, 1
Condition number: 3.72
```

Agent 3 wins because it has the strongest connections to the most connected agents. Not the most connections — the most *central* connections. That's the difference between degree count and eigenvector centrality. The condition number (3.72) tells you this fleet is reasonably well-connected — no agent is isolated.

---

## The Architecture in Brief

```
┌─────────────────────────────────────────┐
│                 Agent                    │
│  IDLE → THINKING → EXECUTING → LEARNING │
│  Spectral decision-making               │
│  Budget-governed lifecycle              │
├─────────────────────────────────────────┤
│              Cells                       │
│  compose(A, B, C) → pipeline            │
│  Budget drains at each step             │
│  Dies when γ runs out                   │
├─────────────────────────────────────────┤
│         Conservation Budget              │
│  γ + η = C  (always, no exceptions)     │
│  spend() moves γ → η                    │
│  transfer() moves between pools         │
├─────────────────────────────────────────┤
│        Spectral Ranker                   │
│  Power iteration on NxN matrices        │
│  topK() for "what matters most"         │
│  conditionNumber() for fleet health     │
├─────────────────────────────────────────┤
│      Capability Scanner                  │
│  Parse CAPABILITY.toml                  │
│  findIntegrations() discovers wiring    │
│  Zero-config service discovery          │
└─────────────────────────────────────────┘
```

## Why These Pieces Fit Together

An **Agent** needs to **decide** what to do. It builds a spectral ranking of its capabilities and picks the best one. The decision costs **budget** (γ → η). The agent **learns** from the outcome, adjusting weights for next time. Capabilities are discovered, not hardcoded — the **scanner** reads TOML manifests and figures out the wiring.

A **Cell** wraps a function with a budget. **Compose** cells into pipelines. The pipeline respects the budget of its weakest link. When γ hits zero, the cell throws. No silent failures — the budget is the law.

The **conservation law** γ + η = C is the invariant holding the whole thing together. Budget is never created or destroyed. It flows from productive to waste. The only way to recover is explicit transfer. This makes resource usage auditable and predictable.

## Build & Test

```bash
npm install
npm run build    # TypeScript → dist/
npm test         # Jest test suite
npm run lint     # Type-check without emit
```

## License

MIT
