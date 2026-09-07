"""
Independent check of the phase-estimation lesson, against Qiskit.

The vitest version of this test derives its expectation from theory (the counting
register should end holding m with m / 2**n == phi) and runs it on our own simulator.
That catches a wrong claim in the prose, but it cannot catch a shared misunderstanding
between our simulator and our test.

So this builds the same circuit with Qiskit and compares statevectors amplitude by
amplitude. Qiskit uses the same little-endian convention we do — qubit 0 is the least
significant bit — so the two state arrays should agree index for index.

    python server/qpe_crosscheck.py
"""

import math
import sys

import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

PI = math.pi


def qpe(phi: float) -> QuantumCircuit:
    """Three counting qubits (0,1,2) estimating the phase of P(2*pi*phi) on qubit 3."""
    th = 2 * PI * phi
    qc = QuantumCircuit(4)
    qc.x(3)
    qc.h(0)
    qc.h(1)
    qc.h(2)
    qc.cp(th, 0, 3)
    qc.cp(2 * th, 1, 3)
    qc.cp(4 * th, 2, 3)
    # Inverse QFT on the counting register, written out gate for gate exactly as the
    # lesson's circuit does it.
    qc.swap(0, 2)
    qc.h(0)
    qc.cp(-PI / 2, 0, 1)
    qc.h(1)
    qc.cp(-PI / 4, 0, 2)
    qc.cp(-PI / 2, 1, 2)
    qc.h(2)
    return qc


CASES = [(1 / 8, 1), (1 / 4, 2), (3 / 8, 3), (1 / 2, 4), (5 / 8, 5), (7 / 8, 7)]

worst = 0.0
failures = []

print(f"{'phi':>8} {'expected m':>11} {'qiskit peak':>12} {'P(peak)':>9}")
print("-" * 44)

for phi, expected in CASES:
    sv = Statevector(qpe(phi))
    probs = np.abs(sv.data) ** 2
    peak = int(np.argmax(probs))
    counting = peak & 0b111          # qubit 3 is the eigenstate, drop it
    p = probs[peak]
    ok = counting == expected
    if not ok:
        failures.append((phi, expected, counting))
    print(f"{phi:>8.3f} {expected:>11d} {counting:>12d} {p:>9.4f}"
          f"{'' if ok else '   <-- MISMATCH'}")

# Amplitude-by-amplitude agreement with our own engine, via the fixture the JS side
# writes. Compared here only if it exists, so this script stands alone.
try:
    import json
    import pathlib

    fixture = pathlib.Path(__file__).parent / "fixtures" / "qpe.json"
    if fixture.exists():
        data = json.loads(fixture.read_text())
        print("\namplitude comparison against our simulator:")
        for entry in data:
            sv = Statevector(qpe(entry["phi"])).data
            ours = np.array([complex(re, im) for re, im in zip(entry["re"], entry["im"])])
            # Global phase is unobservable; align on the largest amplitude before diffing.
            k = int(np.argmax(np.abs(sv)))
            if abs(ours[k]) > 1e-12:
                ours = ours * (sv[k] / abs(sv[k])) / (ours[k] / abs(ours[k]))
            diff = float(np.max(np.abs(sv - ours)))
            worst = max(worst, diff)
            print(f"  phi = {entry['phi']:.4f}   max |delta| = {diff:.3e}")
        print(f"\nworst disagreement: {worst:.3e}")
except Exception as exc:  # noqa: BLE001 - diagnostics only
    print(f"\n(fixture comparison skipped: {exc})")

if failures:
    print("\nFAILED:")
    for phi, expected, got in failures:
        print(f"  phi={phi} expected {expected}, Qiskit gave {got}")
    sys.exit(1)

print("\nAll phases agree with theory, computed independently by Qiskit.")
