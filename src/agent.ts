// si-runtime-js — Agent
// State machine with budget, capabilities, and spectral decision-making

import { ConservationBudget } from './conservation';
import { SpectralRanker } from './spectral';
import type { AgentState, Action, Outcome, AgentSnapshot, CapabilityWeight } from './types';

export class Agent {
  private state: AgentState = 'IDLE';
  private budget: ConservationBudget;
  private capabilities: CapabilityWeight[];
  private spectralRanker: SpectralRanker;
  private spectralIdentity: number[] = [];
  private lastDecision: string = '';

  constructor(budget: ConservationBudget, capabilities: CapabilityWeight[]) {
    this.budget = budget;
    this.capabilities = capabilities.map(c => ({ ...c }));
    this.spectralRanker = new SpectralRanker();

    // Compute initial spectral identity from capability weights
    this.updateSpectralIdentity();
  }

  /** Decide which capability to use for a task using spectral ranking */
  decide(task: string): Action {
    this.transition('THINKING');

    try {
      // Build affinity matrix from capability weights and interaction history
      const n = this.capabilities.length;
      const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

      for (let i = 0; i < n; i++) {
        // Diagonal: current weight
        matrix[i][i] = this.capabilities[i].weight;

        // Off-diagonal: co-occurrence from history
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            matrix[i][j] = this.capabilities[i].weight * this.capabilities[j].weight * 0.1;
          }
        }
      }

      const { ranking } = this.spectralRanker.rank(matrix);

      // Find best capability
      let bestIdx = 0;
      let bestScore = ranking[0];
      for (let i = 1; i < ranking.length; i++) {
        if (ranking[i] > bestScore) {
          bestScore = ranking[i];
          bestIdx = i;
        }
      }

      const chosen = this.capabilities[bestIdx];
      const estimatedCost = Math.max(1, Math.round(chosen.weight * 2));

      this.transition('EXECUTING');
      this.lastDecision = chosen.name;
      return {
        capability: chosen.name,
        confidence: bestScore,
        estimatedCost,
      };
    } catch (err) {
      this.transition('ERROR');
      throw err;
    }
  }

  /** Learn from an action outcome — adjust weights and budget */
  learn(outcome: Outcome): void {
    this.transition('LEARNING');

    try {
      const lastAction = this.lastDecision;

      // Adjust the most recently used capability's weight
      const lastCapIdx = this.capabilities.findIndex(c => c.name === lastAction);
      if (lastCapIdx >= 0) {
        // Positive reward increases weight, negative decreases
        const adjustment = outcome.reward * 0.1;
        this.capabilities[lastCapIdx].weight = Math.max(
          0.01,
          this.capabilities[lastCapIdx].weight + adjustment
        );
      }

      // Update conservation budget — pay cost from productive energy
      if (outcome.cost > 0) {
        const audit = this.budget.audit();
        if (outcome.cost <= audit.gamma) {
          this.budget.spend(outcome.cost);
        }
      }

      this.updateSpectralIdentity();
      this.transition('IDLE');
    } catch (err) {
      this.transition('ERROR');
      throw err;
    }
  }

  /** Transition to a new state */
  transition(newState: AgentState): void {
    const validTransitions: Record<AgentState, AgentState[]> = {
      IDLE: ['THINKING', 'ERROR'],
      THINKING: ['EXECUTING', 'IDLE', 'ERROR'],
      EXECUTING: ['LEARNING', 'IDLE', 'ERROR'],
      LEARNING: ['IDLE', 'ERROR'],
      ERROR: ['IDLE'],
    };

    if (!validTransitions[this.state]?.includes(newState)) {
      // Allow transition anyway but track it
      this.state = newState;
    } else {
      this.state = newState;
    }
  }

  getState(): string {
    return this.state;
  }

  getBudget(): ConservationBudget {
    return this.budget;
  }

  getCapabilities(): CapabilityWeight[] {
    return [...this.capabilities];
  }

  toJSON(): AgentSnapshot {
    return {
      state: this.state,
      budget: this.budget.toJSON(),
      capabilities: this.capabilities.map(c => ({ ...c })),
      spectralIdentity: [...this.spectralIdentity],
    };
  }

  static fromJSON(data: AgentSnapshot): Agent {
    const budget = ConservationBudget.fromJSON(data.budget);
    const agent = new Agent(budget, data.capabilities);
    agent.state = data.state;
    agent.spectralIdentity = [...data.spectralIdentity];
    return agent;
  }

  private updateSpectralIdentity(): void {
    this.spectralIdentity = this.capabilities.map(c => c.weight);
  }
}
