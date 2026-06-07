// si-runtime-js — Core type definitions

/** Conservation budget allocation */
export interface BudgetAllocation {
  gamma: number; // productive energy
  eta: number;   // waste / entropy
  C: number;     // total budget (gamma + eta must equal C)
}

/** Result of a conservation budget audit */
export interface BudgetAudit extends BudgetAllocation {
  utilization: number; // gamma / C
}

/** Result of spectral ranking */
export interface SpectralResult {
  eigenvalues: number[];
  ranking: number[];
}

/** A parsed CAPABILITY.toml manifest */
export interface CapabilityManifest {
  name: string;
  layer: string;
  provides: string[];
  requires: string[];
  integrates: Record<string, string>;
}

/** A suggested integration between two capabilities */
export interface IntegrationSuggestion {
  from: string;
  to: string;
  reason: string;
  priority: number;
}

/** Result of executing a cell */
export interface CellResult {
  output: any;
  cost: number;
  budgetRemaining: number;
}

/** An action chosen by the agent */
export interface Action {
  capability: string;
  confidence: number;
  estimatedCost: number;
}

/** Outcome of an action for learning */
export interface Outcome {
  reward: number;
  cost: number;
}

/** Agent states */
export type AgentState = 'IDLE' | 'THINKING' | 'EXECUTING' | 'LEARNING' | 'ERROR';

/** Serializable agent snapshot */
export interface AgentSnapshot {
  state: AgentState;
  budget: BudgetAllocation;
  capabilities: CapabilityWeight[];
  spectralIdentity: number[];
}

/** A capability with an associated weight for agent decision-making */
export interface CapabilityWeight {
  name: string;
  weight: number;
}
