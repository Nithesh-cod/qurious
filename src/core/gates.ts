/**
 * Single-qubit gate matrices.
 *
 * A 2x2 complex matrix [[a, b], [c, d]] is stored flat as
 *   [aRe, aIm, bRe, bIm, cRe, cIm, dRe, dIm]
 * which keeps the simulator's inner loop free of object allocation.
 */

import type { GateName } from './ir';

export type Mat2 = readonly number[]; // length 8

const R2 = Math.SQRT1_2;

export const I: Mat2 = [1, 0, 0, 0, 0, 0, 1, 0];
export const X: Mat2 = [0, 0, 1, 0, 1, 0, 0, 0];
export const Y: Mat2 = [0, 0, 0, -1, 0, 1, 0, 0];
export const Z: Mat2 = [1, 0, 0, 0, 0, 0, -1, 0];
export const H: Mat2 = [R2, 0, R2, 0, R2, 0, -R2, 0];
export const S: Mat2 = [1, 0, 0, 0, 0, 0, 0, 1];
export const SDG: Mat2 = [1, 0, 0, 0, 0, 0, 0, -1];
export const T: Mat2 = [1, 0, 0, 0, 0, 0, R2, R2];
export const TDG: Mat2 = [1, 0, 0, 0, 0, 0, R2, -R2];

export function RX(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return [c, 0, 0, -s, 0, -s, c, 0];
}
export function RY(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return [c, 0, -s, 0, s, 0, c, 0];
}
export function RZ(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return [c, -s, 0, 0, 0, 0, c, s];
}
export function P(lambda: number): Mat2 {
  return [1, 0, 0, 0, 0, 0, Math.cos(lambda), Math.sin(lambda)];
}

/** The 2x2 matrix a gate applies to its target qubit, or null if it is not a 1q unitary. */
export function matrixFor(name: GateName, params?: number[]): Mat2 | null {
  const p = params?.[0] ?? 0;
  switch (name) {
    case 'i': return I;
    case 'x': return X;
    case 'y': return Y;
    case 'z': return Z;
    case 'h': return H;
    case 's': return S;
    case 'sdg': return SDG;
    case 't': return T;
    case 'tdg': return TDG;
    case 'rx': return RX(p);
    case 'ry': return RY(p);
    case 'rz': return RZ(p);
    case 'p': return P(p);
    // The controlled forms reuse the base matrix with a control mask.
    case 'cx': case 'ccx': return X;
    case 'cy': return Y;
    case 'cz': return Z;
    default: return null;
  }
}

/** Inverse pairs used by the optimiser and by the tutor's redundancy check. */
export const INVERSE_OF: Partial<Record<GateName, GateName>> = {
  x: 'x', y: 'y', z: 'z', h: 'h', i: 'i',
  s: 'sdg', sdg: 's', t: 'tdg', tdg: 't',
  cx: 'cx', cy: 'cy', cz: 'cz', swap: 'swap', ccx: 'ccx', cswap: 'cswap',
};
