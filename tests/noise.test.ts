/**
 * Tests for the noise simulator.
 *
 * The claim being defended is that this teaches something true about real hardware, so
 * these check physical behaviour rather than snapshots: the ideal model must reproduce
 * the ideal distribution exactly, readout error must flip bits at the stated rate, and
 * error must accumulate with depth in the direction real machines do.
 */

import { describe, it, expect } from 'vitest';
import { emptyCircuit, op, type Circuit } from '../src/core/ir';
import { run, sample } from '../src/core/simulator';
import {
  IDEAL, NOISE_MODELS, modelById, runNoisy, distributionFidelity, spuriousOutcomes,
} from '../src/core/noise';

function build(qubits: number, ops: ReturnType<typeof op>[]): Circuit {
  const c = emptyCircuit(qubits, 'test');
  c.ops = ops;
  return c;
}
const bell = () => build(2, [op('h', [0]), op('cx', [0, 1])]);
const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);

describe('the ideal model changes nothing', () => {
  it('leaves a Bell state perfect', () => {
    const { counts } = runNoisy(bell(), IDEAL, 2000, 7);
    expect(Object.keys(counts).sort()).toEqual(['00', '11']);
    expect(total(counts)).toBe(2000);
  });

  it('matches the plain sampler on a deterministic circuit', () => {
    const c = build(3, [op('x', [0]), op('x', [2])]);
    const { counts } = runNoisy(c, IDEAL, 500, 3);
    expect(counts).toEqual({ '101': 500 });
  });

  it('reproduces the ideal distribution shape for a superposition', () => {
    const c = build(2, [op('h', [0]), op('h', [1])]);
    const { counts } = runNoisy(c, IDEAL, 4000, 11);
    expect(Object.keys(counts).sort()).toEqual(['00', '01', '10', '11']);
    for (const k of Object.keys(counts)) {
      expect(counts[k]).toBeGreaterThan(850);   // 1000 expected, generous band
      expect(counts[k]).toBeLessThan(1150);
    }
  });

  it('reports no shots in error', () => {
    expect(runNoisy(bell(), IDEAL, 500, 5).shotsWithError).toBe(0);
  });
});

describe('readout error flips bits at the stated rate', () => {
  it('turns a certain |0> into ones about r of the time', () => {
    const model = { ...IDEAL, id: 'ro', label: 'ro', blurb: '', readout: 0.1 };
    const { counts } = runNoisy(build(1, []), model, 8000, 21);
    const ones = counts['1'] ?? 0;
    expect(ones / 8000).toBeGreaterThan(0.08);
    expect(ones / 8000).toBeLessThan(0.12);
  });

  it('a zero readout rate never flips anything', () => {
    const model = { ...IDEAL, id: 'ro0', label: 'ro0', blurb: '', readout: 0 };
    expect(runNoisy(build(1, []), model, 1000, 4).counts).toEqual({ '0': 1000 });
  });
});

describe('gate error damages the state', () => {
  it('breaks the perfect correlation of a Bell state', () => {
    // Ideally |01> and |10> are impossible. Noise makes them appear.
    const model = { ...IDEAL, id: 'g', label: 'g', blurb: '', gate2: 0.08 };
    const { counts } = runNoisy(bell(), model, 4000, 13);
    const broken = (counts['01'] ?? 0) + (counts['10'] ?? 0);
    expect(broken).toBeGreaterThan(0);
    expect(broken / 4000).toBeLessThan(0.3); // damaged, not destroyed
  });

  it('gets worse as the error rate rises', () => {
    const idealCounts = sample(run(bell()).state, 4000, 99);
    const fidelities = [0.002, 0.02, 0.1].map(g => {
      const m = { ...IDEAL, id: 'g', label: 'g', blurb: '', gate2: g };
      return distributionFidelity(idealCounts, runNoisy(bell(), m, 4000, 31).counts);
    });
    expect(fidelities[0]).toBeGreaterThan(fidelities[1]);
    expect(fidelities[1]).toBeGreaterThan(fidelities[2]);
  });

  it('accumulates with circuit depth, which is why depth is the constraint', () => {
    const model = modelById('nisq');
    const shallow = build(2, [op('h', [0]), op('cx', [0, 1])]);
    const deep = build(2, [
      op('h', [0]), op('cx', [0, 1]),
      ...Array.from({ length: 12 }, () => [op('cx', [0, 1]), op('cx', [0, 1])]).flat(),
    ]);
    const a = runNoisy(shallow, model, 1500, 5).shotsWithError / 1500;
    const b = runNoisy(deep, model, 1500, 5).shotsWithError / 1500;
    expect(b).toBeGreaterThan(a);
  });
});

describe('presets are ordered the way real machines are', () => {
  it('trapped ion is more accurate than superconducting, which beats early hardware', () => {
    const idealCounts = sample(run(bell()).state, 4000, 77);
    const f = (id: string) =>
      distributionFidelity(idealCounts, runNoisy(bell(), modelById(id), 4000, 41).counts);
    expect(f('trapped-ion')).toBeGreaterThan(f('nisq'));
    expect(f('nisq')).toBeGreaterThan(f('early'));
  });

  it('every preset puts two-qubit error above single-qubit error', () => {
    for (const m of NOISE_MODELS.filter(x => x.id !== 'ideal')) {
      expect(m.gate2, m.id).toBeGreaterThan(m.gate1);
    }
  });

  it('every preset has a label and an explanation', () => {
    for (const m of NOISE_MODELS) {
      expect(m.label.length, m.id).toBeGreaterThan(2);
      expect(m.blurb.length, m.id).toBeGreaterThan(30);
    }
  });

  it('an unknown id falls back to ideal rather than throwing', () => {
    expect(modelById('nonsense')).toBe(IDEAL);
  });
});

describe('reporting helpers', () => {
  it('is deterministic for a fixed seed', () => {
    const m = modelById('nisq');
    expect(runNoisy(bell(), m, 800, 12).counts).toEqual(runNoisy(bell(), m, 800, 12).counts);
  });

  it('fidelity is 1 for identical distributions and lower otherwise', () => {
    const a = { '00': 500, '11': 500 };
    expect(distributionFidelity(a, a)).toBeCloseTo(1, 6);
    expect(distributionFidelity(a, { '00': 500, '11': 400, '01': 100 })).toBeLessThan(1);
    expect(distributionFidelity(a, { '01': 1000 })).toBeCloseTo(0, 6);
  });

  it('names the outcomes that should have been impossible', () => {
    const spurious = spuriousOutcomes({ '00': 500, '11': 500 }, { '00': 480, '11': 470, '01': 30, '10': 20 });
    expect(spurious.map(s => s.key)).toEqual(['01', '10']);
    expect(spurious[0].count).toBe(30);
  });

  it('counts always add up to the requested shots', () => {
    for (const m of NOISE_MODELS) {
      const r = runNoisy(bell(), m, 777, 8);
      expect(total(r.counts), m.id).toBe(777);
      expect(r.shots).toBe(777);
    }
  });
});
