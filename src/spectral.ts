// si-runtime-js — Spectral Ranker
// Power iteration eigenvalue decomposition for capability ranking

import type { SpectralResult } from './types';

export class SpectralRanker {
  private maxIterations: number;

  constructor(maxIterations = 50) {
    this.maxIterations = maxIterations;
  }

  /** Perform power iteration to find dominant eigenvalue and eigenvector */
  private powerIteration(matrix: number[][]): { eigenvalue: number; eigenvector: number[] } {
    const n = matrix.length;
    let v = new Array(n).fill(1 / n);

    let eigenvalue = 0;
    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Matrix-vector multiply
      const Av = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          Av[i] += matrix[i][j] * v[j];
        }
      }

      // Norm
      const norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0)) || 1;

      // Update eigenvector
      const newV = Av.map(x => x / norm);

      // Eigenvalue estimate (Rayleigh quotient)
      eigenvalue = newV.reduce((s, vi, i) => s + vi * Av[i], 0);

      // Convergence check
      const diff = newV.reduce((s, vi, i) => s + Math.abs(vi - v[i]), 0);
      v = newV;
      if (diff < 1e-10) break;
    }

    return { eigenvalue, eigenvector: v };
  }

  /** Rank items by their spectral scores from an NxN affinity matrix */
  rank(matrix: number[][]): SpectralResult {
    this.validateMatrix(matrix);
    const { eigenvalue, eigenvector } = this.powerIteration(matrix);

    // Get secondary eigenvalues via deflation
    const eigenvalues = [eigenvalue];
    if (matrix.length > 1) {
      // Simple deflation: subtract dominant component
      const deflated = matrix.map((row, i) =>
        row.map((val, j) => val - eigenvalue * eigenvector[i] * eigenvector[j])
      );
      const second = this.powerIteration(deflated);
      eigenvalues.push(second.eigenvalue);
    }

    return {
      eigenvalues,
      ranking: eigenvector,
    };
  }

  /** Return indices of top-K ranked items */
  topK(matrix: number[][], k: number): number[] {
    const { ranking } = this.rank(matrix);
    return ranking
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.index);
  }

  /** Compute the condition number (max/min singular value approximation) */
  conditionNumber(matrix: number[][]): number {
    this.validateMatrix(matrix);
    const { eigenvalue: maxEV } = this.powerIteration(matrix);

    // Approximate min eigenvalue using inverse iteration
    const eps = 1e-8;
    const shifted = matrix.map((row, i) =>
      row.map((val, j) => (i === j ? val - maxEV - eps : val))
    );
    const { eigenvalue: minEVApprox } = this.powerIteration(shifted);
    const minEV = Math.abs(maxEV + eps + minEVApprox);

    if (minEV < 1e-15) return Infinity;
    return Math.abs(maxEV) / minEV;
  }

  private validateMatrix(matrix: number[][]): void {
    if (!matrix.length) throw new Error('Matrix must be non-empty');
    const n = matrix.length;
    for (const row of matrix) {
      if (row.length !== n) {
        throw new Error('Matrix must be square (NxN)');
      }
    }
  }
}
