# INTEGRATION.md — si-runtime-js × open-application

**Browser agent with budget**: si-runtime-js provides TypeScript agents with conservation budgets. open-application (Tauri) provides the desktop shell. Together: a browser agent that respects computational budgets.

## Synergy Map

```
si-runtime-js (TypeScript)        open-application (Tauri)
┌──────────────────────────┐      ┌──────────────────────────┐
│ ConservationBudget       │      │ @tauri-apps/api          │
│   allocate(γ, η)         │      │   event, window, path    │
│   transfer()             │      │ Tauri commands            │
│   spend()                │◄────►│   shell access            │
│ SpectralRanker           │      │   filesystem              │
│   rank(matrix)           │      │   HTTP client             │
│ Agent                    │      │ WebView                   │
│   decide(task)           │      │   browser context         │
│   transition(state)      │      │   DOM access              │
│ Cell                     │      └──────────────────────────┘
│   execute(input)         │                │
│ CapabilityScanner        │                ▼
└──────────────────────────┘    Desktop shell with budget-
                                constrained browser agent
```

## Key Insight

A browser agent that can browse, read, and act — but with a conservation budget. Every computation costs γ (productive budget). Waste operations cost η. The budget invariant `γ + η = C` is enforced in TypeScript by si-runtime-js, and the Tauri shell provides the actual browser access via WebView commands.

## Example 1: Budget-Constrained Browser Agent

Create a Tauri app with an si-runtime-js agent that respects computational budgets:

```typescript
// agent-browser.ts
import { ConservationBudget, Agent, Cell } from 'si-runtime-js';
import type { Action, CapabilityWeight, CellResult } from 'si-runtime-js';

// Budget: 1000 units total, split into productive and waste
const budget = new ConservationBudget(1000);
budget.allocate(800, 200); // 800 productive, 200 waste

// Capabilities: what the browser agent can do
const capabilities: CapabilityWeight[] = [
  { name: 'browse', weight: 0.4 },
  { name: 'extract', weight: 0.3 },
  { name: 'summarize', weight: 0.2 },
  { name: 'alert', weight: 0.1 },
];

const agent = new Agent(budget, capabilities);

// Decision: what should the agent do?
const action: Action = agent.decide('search for latest Rust releases');
console.log('Agent decided:', action);

// Budget check
const audit = budget.audit();
console.log(`Budget: γ=${audit.gamma} η=${audit.eta} C=${audit.C}`);
console.log(`Utilization: ${(audit.gamma / audit.C * 100).toFixed(1)}%`);
console.log(`Waste ratio: ${(audit.eta / audit.C * 100).toFixed(1)}%`);
```

## Example 2: Composable Cell Pipeline with Budget Enforcement

Chain computation cells where each cell costs budget. If budget runs out, the pipeline stops:

```typescript
// pipeline.ts
import { ConservationBudget, Cell } from 'si-runtime-js';

const budget = new ConservationBudget(100);
budget.allocate(90, 10);

// Create computation cells
const fetchCell = new Cell('fetch', budget, (url: string) => {
  console.log(`Fetching: ${url}`);
  return { html: '<html>...</html>', url };
});

const extractCell = new Cell('extract', budget, (data: any) => {
  console.log(`Extracting from: ${data.url}`);
  return { title: 'Page Title', links: ['link1', 'link2'] };
});

const summarizeCell = new Cell('summarize', budget, (data: any) => {
  console.log(`Summarizing: ${data.title}`);
  return { summary: 'Key points from page...', source: data.title };
});

// Add dependencies
extractCell.addDep('fetch');
summarizeCell.addDep('extract');

// Execute pipeline
try {
  const step1: CellResult = fetchCell.execute('https://example.com');
  console.log(`Step 1 cost: ${step1.cost}, remaining: ${step1.budgetRemaining}`);

  const step2: CellResult = extractCell.execute(step1.output);
  console.log(`Step 2 cost: ${step2.cost}, remaining: ${step2.budgetRemaining}`);

  const step3: CellResult = summarizeCell.execute(step2.output);
  console.log(`Step 3 cost: ${step3.cost}, remaining: ${step3.budgetRemaining}`);
  console.log(`Result: ${step3.output.summary}`);
} catch (e) {
  console.error('Pipeline failed:', (e as Error).message);
  // "Cell "summarize" budget exhausted: need 1, have 0"
}

// Check final state
const audit = budget.audit();
console.log(`\nFinal budget: γ=${audit.gamma} η=${audit.eta}`);
console.log(`Total spent: ${90 - audit.gamma} units`);
```

## Example 3: Tauri Integration — Desktop Agent

The Tauri shell invokes the agent. In `src-tauri/src/main.rs`:

```rust
// Tauri backend: minimal shell for the budget agent
#[tauri::command]
fn run_agent(task: String, budget_total: f64) -> String {
    // The heavy lifting is in TypeScript (si-runtime-js)
    // Rust side just provides the shell
    format!("Task '{}' queued with budget {}", task, budget_total)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_agent])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Frontend TypeScript:

```typescript
// main.ts — Tauri frontend with si-runtime-js agent
import { invoke } from '@tauri-apps/api/core';
import { ConservationBudget, Agent, SpectralRanker } from 'si-runtime-js';
import type { CapabilityWeight } from 'si-runtime-js';

class DesktopAgent {
  private agent: Agent;
  private budget: ConservationBudget;

  constructor(totalBudget: number) {
    this.budget = new ConservationBudget(totalBudget);
    this.budget.allocate(totalBudget * 0.8, totalBudget * 0.2);

    const caps: CapabilityWeight[] = [
      { name: 'browse', weight: 0.4 },
      { name: 'extract', weight: 0.3 },
      { name: 'summarize', weight: 0.2 },
      { name: 'notify', weight: 0.1 },
    ];

    this.agent = new Agent(this.budget, caps);
  }

  async execute(task: string): Promise<string> {
    const action = this.agent.decide(task);
    console.log(`Agent action: ${JSON.stringify(action)}`);

    // Use spectral ranker to prioritize capabilities
    const ranker = new SpectralRanker();
    const matrix = [
      [0.4, 0.12, 0.08, 0.04],
      [0.12, 0.3, 0.06, 0.03],
      [0.08, 0.06, 0.2, 0.02],
      [0.04, 0.03, 0.02, 0.1],
    ];
    const { ranking } = ranker.rank(matrix);
    console.log('Capability ranking:', ranking);

    // Execute via Tauri backend
    const result = await invoke('run_agent', {
      task,
      budgetTotal: this.budget.audit().C,
    });

    return result as string;
  }

  status() {
    const audit = this.budget.audit();
    return {
      utilization: audit.gamma / audit.C,
      wasteRatio: audit.eta / audit.C,
      productive: audit.gamma,
      waste: audit.eta,
    };
  }
}

// Usage
const agent = new DesktopAgent(1000);
agent.execute('research Rust async patterns').then(console.log);
console.log('Agent status:', agent.status());
```

## Data Flow

```
User task
    │
    ▼
DesktopAgent.execute(task)
    │
    ├──► Agent.decide(task) → Action
    │         │
    │         ▼
    │    SpectralRanker.rank() → capability priority
    │
    ├──► Cell pipeline (fetch → extract → summarize)
    │         │
    │         ▼
    │    ConservationBudget.spend() per cell
    │    Budget exhausted → pipeline stops
    │
    └──► Tauri invoke() → Rust shell
              │
              ▼
         Filesystem / HTTP / DOM access
```

## When to Use This Combination

- **Desktop AI agents**: browser agents that run on the desktop with real file/network access
- **Budget-constrained automation**: web scraping, research, data extraction with enforced compute limits
- **Safe browsing**: agent that literally cannot exceed its computational budget
- **Composable pipelines**: chain cells with dependencies where each step costs budget
