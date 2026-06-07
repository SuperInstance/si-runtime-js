# si-runtime-js

**General-purpose JavaScript/TypeScript runtime for constraint-aware AI.**

Conservation budgets, spectral ranking, capability discovery, and cell composition — works in both **browser** and **Node.js**.

## Install

```bash
npm install si-runtime
```

## Usage

### Node.js

```typescript
import { ConservationBudget, SpectralRanker, Agent, Cell, CapabilityScanner } from 'si-runtime';

// Create a conservation budget (productive + waste = total)
const budget = new ConservationBudget(100);
budget.allocate(80, 20); // 80 productive, 20 waste
budget.spend(10);        // use 10 productive → becomes waste
console.log(budget.audit()); // { gamma: 70, eta: 30, C: 100, utilization: 0.7 }

// Spectral ranking of capabilities
const ranker = new SpectralRanker();
const matrix = [[4, 1], [1, 3]];
const { eigenvalues, ranking } = ranker.rank(matrix);
console.log('Top capabilities:', ranker.topK(matrix, 1));

// Agent with budget + capabilities
const agentBudget = new ConservationBudget(1000);
agentBudget.allocate(800, 200);
const agent = new Agent(agentBudget, [
  { name: 'compute', weight: 0.8 },
  { name: 'transform', weight: 0.5 },
]);
const action = agent.decide('process data');
agent.learn({ reward: 1.0, cost: 5 });

// Composable cells
const b1 = new ConservationBudget(100); b1.allocate(80, 20);
const b2 = new ConservationBudget(100); b2.allocate(80, 20);
const addOne = new Cell('addOne', b1, (x: number) => x + 1);
const double = new Cell('double', b2, (x: number) => x * 2);
const pipeline = addOne.compose(double);
console.log(pipeline.execute(5)); // { output: 12, cost: 1, budgetRemaining: ... }

// Capability scanning
const scanner = new CapabilityScanner();
const manifest = scanner.parse(tomlString);
const integrations = scanner.findIntegrations([manifest1, manifest2]);
```

### Browser

```html
<script type="module">
  import { ConservationBudget } from 'https://unpkg.com/si-runtime/dist/index.js';

  const budget = new ConservationBudget(100);
  budget.allocate(70, 30);
  console.log(budget.audit());
</script>
```

## API

### `ConservationBudget`

Enforces the conservation invariant: **γ (productive) + η (waste) = C (total)**.

| Method | Description |
|--------|-------------|
| `new ConservationBudget(C)` | Create with total budget C |
| `allocate(gamma, eta)` | Split budget into productive/waste (must sum to C) |
| `transfer(from, to, amount)` | Move budget between gamma and eta |
| `spend(amount)` | Use productive budget (converts to waste) |
| `audit()` | Returns `{ gamma, eta, C, utilization }` |
| `toJSON()` / `fromJSON(data)` | Serialization |

### `SpectralRanker`

Power iteration eigenvalue decomposition for ranking.

| Method | Description |
|--------|-------------|
| `rank(matrix)` | Returns `{ eigenvalues, ranking }` from NxN matrix |
| `topK(matrix, k)` | Indices of top-k ranked items |
| `conditionNumber(matrix)` | Matrix condition number |

### `CapabilityScanner`

Parses simplified CAPABILITY.toml and discovers integrations.

| Method | Description |
|--------|-------------|
| `parse(tomlString)` | Parse TOML into a `CapabilityManifest` |
| `scanDir(paths)` | Scan multiple TOML strings |
| `findIntegrations(manifests[])` | Suggest integrations between capabilities |

### `Cell`

Composable computation unit with budget enforcement.

| Method | Description |
|--------|-------------|
| `new Cell(name, budget, handler)` | Create a cell |
| `addDep(name)` | Add a dependency |
| `execute(input)` | Run handler, returns `{ output, cost, budgetRemaining }` |
| `compose(other)` | Pipe output of this cell into another |

### `Agent`

State machine with spectral decision-making.

States: `IDLE → THINKING → EXECUTING → LEARNING → IDLE`

| Method | Description |
|--------|-------------|
| `new Agent(budget, capabilities)` | Create agent |
| `decide(task)` | Pick best capability using spectral ranking |
| `learn({ reward, cost })` | Adjust weights and budget from outcome |
| `transition(state)` | Change agent state |
| `toJSON()` / `fromJSON(data)` | Serialization |

## WASM Integration

This library connects to the SuperInstance Rust crates via WASM:

```
┌─────────────────┐     ┌──────────────────┐
│  si-runtime-js  │────▶│  si-core (Rust)  │
│  (TypeScript)   │     │  via WASM bridge  │
└─────────────────┘     └──────────────────┘
```

- **Conservation budgets** are portable — serialize in JS, verify in Rust
- **Spectral ranking** can fall back to Rust SIMD for large matrices
- **Capability manifests** are shared between JS and Rust runtimes
- **Cell pipelines** can offload heavy computation to WASM modules

## License

MIT
