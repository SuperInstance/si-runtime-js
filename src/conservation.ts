// si-runtime-js — Conservation Budget
// Enforces the invariant: γ (productive) + η (waste) = C (total)

import type { BudgetAllocation, BudgetAudit } from './types';

export class ConservationBudget {
  private gamma: number;
  private eta: number;
  private C: number;

  constructor(totalBudget: number) {
    if (totalBudget <= 0) {
      throw new Error('Total budget C must be positive');
    }
    this.C = totalBudget;
    this.gamma = 0;
    this.eta = 0;
  }

  /** Allocate budget into productive (gamma) and waste (eta) portions */
  allocate(gamma: number, eta: number): void {
    if (gamma < 0 || eta < 0) {
      throw new Error('gamma and eta must be non-negative');
    }
    if (gamma + eta !== this.C) {
      throw new Error(
        `Conservation violation: gamma(${gamma}) + eta(${eta}) = ${gamma + eta} ≠ C(${this.C})`
      );
    }
    this.gamma = gamma;
    this.eta = eta;
  }

  /** Transfer budget between gamma and eta while preserving conservation */
  transfer(from: 'gamma' | 'eta', to: 'gamma' | 'eta', amount: number): void {
    if (amount < 0) {
      throw new Error('Transfer amount must be non-negative');
    }
    if (from === to) return;

    const src = from === 'gamma' ? this.gamma : this.eta;
    if (amount > src) {
      throw new Error(`Insufficient ${from} budget: have ${src}, need ${amount}`);
    }

    if (from === 'gamma') {
      this.gamma -= amount;
      this.eta += amount;
    } else {
      this.eta -= amount;
      this.gamma += amount;
    }
  }

  /** Spend productive budget; returns remaining gamma */
  spend(amount: number): number {
    if (amount < 0) throw new Error('Spend amount must be non-negative');
    if (amount > this.gamma) {
      throw new Error(`Budget exhausted: requested ${amount}, have ${this.gamma}`);
    }
    this.gamma -= amount;
    this.eta += amount; // productive energy becomes waste (entropy)
    return this.gamma;
  }

  /** Return a budget audit */
  audit(): BudgetAudit {
    return {
      gamma: this.gamma,
      eta: this.eta,
      C: this.C,
      utilization: this.C > 0 ? this.gamma / this.C : 0,
    };
  }

  toJSON(): BudgetAllocation {
    return { gamma: this.gamma, eta: this.eta, C: this.C };
  }

  static fromJSON(data: BudgetAllocation): ConservationBudget {
    const budget = new ConservationBudget(data.C);
    budget.allocate(data.gamma, data.eta);
    return budget;
  }
}
