# INTEGRATION.md — si-runtime-js

Cross-language integration guide for the **SuperInstance TypeScript/JavaScript runtime** (`si-runtime-js`).
This document shows the same conservation budget operation in all 7 supported languages,
how this library connects to the broader SuperInstance ecosystem, and FFI binding patterns.

---

## Table of Contents

1. [Same Operation in 7 Languages](#1-same-operation-in-7-languages)
2. [Cross-Repo Integration](#2-cross-repo-integration)
3. [FFI Bindings](#3-ffi-bindings)

---

## 1. Same Operation in 7 Languages

The canonical operation: **create a conservation budget of C=1000, allocate gamma=600 and eta=400, verify the invariant γ+η=C, then transfer 50 from gamma to eta.**

### TypeScript (si-runtime-js — this repo)

```typescript
import { ConservationBudget } from 'si-runtime-js';

// Create budget with total C = 1000
const budget = new ConservationBudget(1000);

// Allocate gamma (productive) and eta (waste)
budget.allocate(600, 400);

// Audit: verify γ + η == C
const report = budget.audit();
console.log(`gamma=${report.gamma} eta=${report.eta} total=${report.C}`);
console.log(`utilization: ${(report.utilization * 100).toFixed(1)}%`);

// Transfer 50 from gamma to eta (productive → waste)
budget.transfer('gamma', 'eta', 50);

// Re-audit
const after = budget.audit();
console.log(`After transfer: gamma=${after.gamma} eta=${after.eta}`);
// gamma=550 eta=450, still sums to 1000

// Serialize for API transmission
const json = budget.toJSON();
console.log('Serialized:', JSON.stringify(json));

// Deserialize
const restored = ConservationBudget.fromJSON(json);
console.log('Restored gamma:', restored.audit().gamma);
```

### Rust (conservation-law-rs — reference implementation)

```rust
use conservation_law::ConservationBudget;

fn main() {
    let mut budget = ConservationBudget::new(1000.0);
    budget.allocate(600.0, 400.0).expect("allocation failed");

    let audit = budget.audit();
    assert!((audit.gamma + audit.eta - audit.total).abs() < 1e-10);
    println!("gamma={} eta={} total={}", audit.gamma, audit.eta, audit.total);

    budget.transfer("gamma", "eta", 50.0).expect("transfer failed");
    let audit = budget.audit();
    println!("After transfer: gamma={} eta={}", audit.gamma, audit.eta);
}
```

### C (si-core-c)

```c
#include "si_core.h"
#include <stdio.h>
#include <assert.h>

int main(void) {
    si_init();
    SiBudget *budget = budget_create(1000.0);
    budget_allocate(budget, 600.0, 400.0);

    BudgetReport rpt = budget_audit(budget);
    assert(rpt.violation == 0);
    printf("gamma=%.1f eta=%.1f total=%.1f\n",
           rpt.gamma, rpt.eta, rpt.total_budget);

    budget_transfer(budget, 0, 1, 50.0);
    rpt = budget_audit(budget);
    printf("After transfer: gamma=%.1f eta=%.1f\n", rpt.gamma, rpt.eta);

    budget_free(budget);
    si_shutdown();
    return 0;
}
```

### Python (si-runtime-python)

```python
from si_runtime import Budget, AgentBudget, validate_budget

budget = Budget(total=1000.0, gamma=600.0, eta=400.0)
assert validate_budget(budget)
print(f"gamma={budget.gamma} eta={budget.eta} total={budget.total}")
```

### Zig (si-runtime-zig)

```zig
const conservation = @import("conservation.zig");

pub fn main() !void {
    var budget = conservation.ConservationBudget.init(1000.0);
    try budget.allocate(600.0, 400.0);
    const report = try budget.audit();
    std.debug.print("gamma={d:.1} eta={d:.1} total={d:.1}\n",
        .{ report.gamma, report.eta, report.total });
    try budget.transfer(true, 50.0);
}
```

### Go (si-runtime-go)

```go
package main

import siruntime "github.com/SuperInstance/si-runtime-go"

func main() {
    budget := siruntime.NewBudget(1000)
    budget.Allocate(600, 400)
    fmt.Printf("gamma=%.1f eta=%.1f total=%.1f\n",
        budget.Gamma, budget.Eta, budget.Total)
    budget.Transfer(50)
}
```

### WASM (si-runtime-wasm — from JavaScript)

```javascript
import init, { Budget } from 'si-runtime-wasm';

async function run() {
    await init();
    const budget = new Budget(1000);
    budget.allocate(300);
    budget.transfer_gamma_to_eta(50);
    console.log(`Audit: ${budget.audit()}, gamma=${budget.gamma()}`);
}
```

---

## 2. Cross-Repo Integration

### conservation-law-rs (Mathematical Foundation)

The TypeScript `ConservationBudget` class mirrors the Rust `ConservationBudget` struct.
The `allocate()` method enforces the same γ+η=C invariant. The `BudgetAudit` and
`BudgetAllocation` interfaces correspond to Rust's audit and serialization types.

**Connection points:**
- `new ConservationBudget(C)` ↔ `ConservationBudget::new(C)`
- `budget.allocate(γ, η)` ↔ `ConservationBudget::allocate(γ, η)`
- `budget.audit()` → `BudgetAudit` ↔ `ConservationBudget::audit()`
- `budget.toJSON()` ↔ Rust serialization
- `ConservationBudget.fromJSON()` ↔ Rust deserialization

### spectral-fleet-rs (Fleet Ranking)

The TypeScript `SpectralRanker` class uses the same power-iteration algorithm as
`spectral-fleet-rs`. TypeScript agents can participate in fleet ranking by computing
eigenvector centrality from adjacency matrices in the same row-major format.

**Connection points:**
- `SpectralRanker.rank(matrix)` ↔ Rust `power_iteration()`
- `SpectralRanker.topK(matrix, k)` ↔ Rust `top_k()`
- `SpectralRanker.conditionNumber(matrix)` ↔ Rust `condition_number()`

### si-cli (CLI Discovery)

`si-cli` can discover TypeScript/JavaScript agents running in Node.js. The CLI communicates
with JS agents via JSON-RPC or HTTP, using the serialized `AgentSnapshot` format.

**Connection points:**
- `Agent.toJSON()` → CLI agent discovery protocol
- `Agent.fromJSON(snapshot)` → CLI agent restoration
- `CapabilityScanner.parse(toml)` → CLI capability manifest parsing
- `ConservationBudget.toJSON()` → CLI budget display

### si-fleet-api (REST API Layer)

The fleet API serves TypeScript agent state as JSON. The `AgentSnapshot` and `BudgetAllocation`
interfaces produce API-compatible JSON directly. The `ConservationBudget.toJSON()` method
generates the exact schema expected by `GET /agents/:id/budget`.

**Connection points:**
- `budget.audit()` → `GET /agents/:id/budget` response
- `agent.toJSON()` → `GET /agents/:id` response
- `SpectralRanker.rank()` → `POST /fleet/rank` request body
- `CapabilityScanner.findIntegrations()` → `GET /fleet/integrations`

### Supabase Fleet Registry (Data Backend)

TypeScript agents persist state to Supabase via the fleet API. The `AgentSnapshot` and
`BudgetAllocation` interfaces map to Supabase table columns.

**Connection points:**
- `BudgetAllocation { gamma, eta, C }` → `agent_budgets` table
- `AgentSnapshot { state, budget, capabilities, spectralIdentity }` → `agent_snapshots` table
- `CapabilityManifest` → `capabilities` table
- `IntegrationSuggestion` → `integration_suggestions` table

### sunset-ecosystem (Fleet Coordination)

`sunset-ecosystem` coordinates multi-fleet operations. TypeScript agents participate by
exposing their `Agent` state through the JSON serialization format, which sunset-ecosystem
consumes for fleet rebalancing decisions.

**Connection points:**
- `Agent.learn(outcome)` for fleet-level learning coordination
- `ConservationBudget.spend()` for budget-aware task execution
- `SpectralRanker.topK()` for capability selection
- `Cell.compose()` for computation pipeline construction

---

## 3. FFI Bindings

### Calling si-runtime-js from Rust (via node-bindgen or WASM)

```rust
// Option 1: WASM bridge
use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "si-runtime-js")]
extern "C" {
    type ConservationBudget;

    #[wasm_bindgen(constructor)]
    fn new(total: f64) -> ConservationBudget;

    #[wasm_bindgen(method)]
    fn allocate(this: &ConservationBudget, gamma: f64, eta: f64);

    #[wasm_bindgen(method, js_name = audit)]
    fn audit(this: &ConservationBudget) -> JsValue;
}
```

### Calling si-runtime-js from Python (via JS2PY or subprocess)

```python
import subprocess, json

# Use Node.js subprocess to evaluate TypeScript
def call_js_budget(total, gamma, eta):
    script = f"""
    const {{ ConservationBudget }} = require('si-runtime-js');
    const b = new ConservationBudget({total});
    b.allocate({gamma}, {eta});
    console.log(JSON.stringify(b.audit()));
    """
    result = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    return json.loads(result.stdout)

audit = call_js_budget(1000, 600, 400)
print(f"JS audit: {audit}")
```

### Calling si-runtime-js from C (via Node.js C API)

```c
#include <node_api.h>

// Complex — typically done via HTTP/JSON bridge rather than direct N-API
// Recommended: run JS runtime as a microservice and communicate via REST
```

### Calling si-runtime-js from Go (via V8Go)

```go
package main

import "rogchap.com/v8go"

func callJSBudget() {
    ctx, _ := v8go.NewContext()
    ctx.RunScript(`
        const { ConservationBudget } = require('si-runtime-js');
        const b = new ConservationBudget(1000);
        b.allocate(600, 400);
        JSON.stringify(b.audit());
    `, "budget.js")
}
```

### Calling C from TypeScript/Node.js (via ffi-napi)

```typescript
import ffi from 'ffi-napi';
import ref from 'ref-napi';

const siCore = ffi.Library('./libsi_core', {
    'si_init':          ['void',  []],
    'budget_create':    ['pointer', ['double']],
    'budget_allocate':  ['int',   ['pointer', 'double', 'double']],
    'budget_free':      ['void',  ['pointer']],
    'si_shutdown':      ['void',  []],
});

siCore.si_init();
const budget = siCore.budget_create(1000);
const err = siCore.budget_allocate(budget, 600, 400);
console.log('C allocate result:', err);
siCore.budget_free(budget);
siCore.si_shutdown();
```

### Calling Rust from TypeScript (via WASM)

```typescript
import init, { ConservationBudget as RustBudget } from 'conservation-law-wasm';

async function useRustBudget() {
    await init();
    const budget = new RustBudget(1000);
    budget.allocate(600, 400);
    console.log('Rust budget audit:', budget.audit());
}
```

### Calling si-runtime-js from Zig

Zig doesn't have a native JS bridge. Use the C ABI path:
1. Compile `si-core-c` to a shared library
2. Call from Zig via `@cImport`
3. Or run the JS runtime as a subprocess/service

---

## Integration Test Matrix

| From → To | C | Rust | Python | TypeScript | Zig | Go | WASM |
|---|---|---|---|---|---|---|---|
| **TypeScript** | ffi-napi | WASM bridge | subprocess | ✅ native | HTTP bridge | HTTP bridge | JS import |
| **C** | ✅ native | cdylib | ctypes | ffi-napi | `@cImport` | cgo | emscripten |
| **Rust** | extern "C" | ✅ native | PyO3 | wasm-bindgen | C ABI | C ABI | wasm-bindgen |
| **Python** | ctypes | PyO3 | ✅ native | subprocess | C API | C API | N/A |
| **Zig** | `@cImport` | C ABI | C ABI | HTTP bridge | ✅ native | C ABI | N/A |
| **Go** | cgo | C ABI | C API | HTTP bridge | C ABI | ✅ native | N/A |
| **WASM** | emscripten | wasm-bindgen | N/A | JS import | N/A | N/A | ✅ native |

---

## TypeScript API Summary

| Export | Type | Description |
|---|---|---|
| `ConservationBudget` | Class | Budget with γ+η=C invariant |
| `SpectralRanker` | Class | Power-iteration eigenvalue ranking |
| `CapabilityScanner` | Class | TOML manifest parser |
| `Cell` | Class | Composable computation unit |
| `Agent` | Class | State machine with budget and ranking |
| `BudgetAllocation` | Interface | `{ gamma, eta, C }` |
| `BudgetAudit` | Interface | `{ gamma, eta, C, utilization }` |
| `SpectralResult` | Interface | `{ eigenvalues, ranking }` |
| `AgentSnapshot` | Interface | Serializable agent state |
| `CapabilityManifest` | Interface | Parsed capability TOML |
| `CellResult` | Interface | `{ output, cost, budgetRemaining }` |

---

*Generated for SuperInstance cross-language integration — si-runtime-js v0.1.0*
