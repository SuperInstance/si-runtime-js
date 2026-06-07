// si-runtime-js — Cell
// Composable computation unit with conservation budget enforcement

import { ConservationBudget } from './conservation';
import type { CellResult } from './types';

export class Cell {
  readonly name: string;
  private budget: ConservationBudget;
  private handler: (input: any) => any;
  private deps: string[] = [];

  constructor(name: string, budget: ConservationBudget, handler: (input: any) => any) {
    this.name = name;
    this.budget = budget;
    this.handler = handler;
  }

  /** Add a named dependency */
  addDep(depName: string): void {
    if (!this.deps.includes(depName)) {
      this.deps.push(depName);
    }
  }

  /** Get current dependencies */
  getDeps(): string[] {
    return [...this.deps];
  }

  /** Execute the cell's handler, tracking budget usage */
  execute(input: any): CellResult {
    const auditBefore = this.budget.audit();
    const cost = 1; // Base computation cost

    if (auditBefore.gamma < cost) {
      throw new Error(
        `Cell "${this.name}" budget exhausted: need ${cost}, have ${auditBefore.gamma}`
      );
    }

    const output = this.handler(input);
    this.budget.spend(cost);

    return {
      output,
      cost,
      budgetRemaining: this.budget.audit().gamma,
    };
  }

  /** Compose this cell with another — output of this feeds into other */
  compose(other: Cell): Cell {
    const self = this;
    // Combined budget: take the minimum remaining gamma
    const combinedBudget = new ConservationBudget(
      Math.min(self.budget.audit().C, other.budget.audit().C)
    );
    combinedBudget.allocate(
      Math.min(self.budget.audit().gamma, other.budget.audit().gamma),
      combinedBudget.audit().C - Math.min(self.budget.audit().gamma, other.budget.audit().gamma)
    );

    const composedName = `${self.name}>${other.name}`;
    const composed = new Cell(composedName, combinedBudget, (input: any) => {
      const result1 = self.execute(input);
      const result2 = other.execute(result1.output);
      return result2.output;
    });

    // Merge dependencies
    for (const dep of [...self.deps, ...other.deps]) {
      composed.addDep(dep);
    }

    return composed;
  }

  /** Get budget audit */
  audit() {
    return this.budget.audit();
  }
}
