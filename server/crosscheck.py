"""
Cross-check our in-browser simulator against Qiskit Aer.

Run:  python server/crosscheck.py

Reads the fixture emitted by `npx vitest run tests/export-crosscheck.test.ts`, which
contains, for each test circuit, the OpenQASM 3 our transpiler produced and the
statevector our own simulator computed. Each circuit is re-run through Qiskit and the
two statevectors are compared, with a global phase allowed (a global phase is not
physically observable, so two states differing only by one are the same state).

The number this prints is the one to quote when someone asks how you know the
simulator is correct.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

try:
    from qiskit import QuantumCircuit
    from qiskit.quantum_info import Statevector
except ImportError:
    sys.exit("Qiskit is not installed. Run:  pip install qiskit qiskit-aer")

FIXTURE = Path(__file__).parent / "fixtures" / "crosscheck.json"
TOLERANCE = 1e-10


GATES = {
    "i": lambda qc, q, p: qc.id(q[0]),
    "x": lambda qc, q, p: qc.x(q[0]),
    "y": lambda qc, q, p: qc.y(q[0]),
    "z": lambda qc, q, p: qc.z(q[0]),
    "h": lambda qc, q, p: qc.h(q[0]),
    "s": lambda qc, q, p: qc.s(q[0]),
    "sdg": lambda qc, q, p: qc.sdg(q[0]),
    "t": lambda qc, q, p: qc.t(q[0]),
    "tdg": lambda qc, q, p: qc.tdg(q[0]),
    "rx": lambda qc, q, p: qc.rx(p[0], q[0]),
    "ry": lambda qc, q, p: qc.ry(p[0], q[0]),
    "rz": lambda qc, q, p: qc.rz(p[0], q[0]),
    "p": lambda qc, q, p: qc.p(p[0], q[0]),
    "cx": lambda qc, q, p: qc.cx(q[0], q[1]),
    "cy": lambda qc, q, p: qc.cy(q[0], q[1]),
    "cz": lambda qc, q, p: qc.cz(q[0], q[1]),
    "swap": lambda qc, q, p: qc.swap(q[0], q[1]),
    "ccx": lambda qc, q, p: qc.ccx(q[0], q[1], q[2]),
    "cswap": lambda qc, q, p: qc.cswap(q[0], q[1], q[2]),
    "barrier": lambda qc, q, p: None,
    "measure": lambda qc, q, p: None,
}


def build_circuit(case: dict) -> QuantumCircuit:
    """Rebuild the circuit in Qiskit straight from the op list."""
    qc = QuantumCircuit(case["qubits"])
    for o in case["ops"]:
        fn = GATES.get(o["name"])
        if fn is None:
            raise ValueError(f"unsupported gate {o['name']}")
        fn(qc, o["qubits"], o.get("params") or [])
    return qc


def load_qasm(qasm: str) -> QuantumCircuit:
    """Parse OpenQASM 3, falling back to the QASM 2 loader on older Qiskit."""
    try:
        from qiskit import qasm3
        return qasm3.loads(qasm)
    except Exception:
        from qiskit import qasm2
        q2 = qasm.replace("OPENQASM 3.0;", "OPENQASM 2.0;")
        q2 = q2.replace('include "stdgates.inc";', 'include "qelib1.inc";')
        lines = []
        for line in q2.splitlines():
            s = line.strip()
            if s.startswith("qubit["):
                n = s[s.index("[") + 1: s.index("]")]
                lines.append(f"qreg q[{n}];")
            elif s.startswith("bit["):
                n = s[s.index("[") + 1: s.index("]")]
                lines.append(f"creg meas[{n}];")
            elif "= measure" in s:
                target, src = s.split("= measure")
                lines.append(f"measure {src.strip().rstrip(';')} -> {target.strip()};")
            else:
                lines.append(line)
        return qasm2.loads("\n".join(lines))


def phase_aligned_max_diff(ours: np.ndarray, theirs: np.ndarray) -> float:
    """Largest amplitude difference after cancelling any global phase."""
    overlap = np.vdot(theirs, ours)
    if abs(overlap) > 1e-12:
        theirs = theirs * (overlap / abs(overlap))
    return float(np.max(np.abs(ours - theirs)))


def main() -> int:
    if not FIXTURE.exists():
        sys.exit(
            f"Fixture not found at {FIXTURE}.\n"
            "Generate it first:  npx vitest run tests/export-crosscheck.test.ts"
        )

    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cases = data["cases"]

    print(f"Cross-checking {len(cases)} circuits against Qiskit Aer\n")
    print(f"{'circuit':<20} {'qubits':>6} {'max amplitude diff':>20}   {'fidelity':>10}   result")
    print("-" * 78)

    worst = 0.0
    failures = 0

    for case in cases:
        ours = np.array(case["re"], dtype=float) + 1j * np.array(case["im"], dtype=float)
        try:
            qc = build_circuit(case)
            theirs = np.asarray(Statevector.from_instruction(qc).data, dtype=complex)
        except Exception as exc:  # noqa: BLE001 - report and keep going
            print(f"{case['name']:<20} {case['qubits']:>6} {'—':>20}   {'—':>10}   ERROR: {exc}")
            failures += 1
            continue

        if theirs.shape != ours.shape:
            print(f"{case['name']:<20} {case['qubits']:>6} {'—':>20}   {'—':>10}   SIZE MISMATCH")
            failures += 1
            continue

        diff = phase_aligned_max_diff(ours, theirs)
        fidelity = float(abs(np.vdot(theirs, ours)) ** 2)
        ok = diff < TOLERANCE
        worst = max(worst, diff)
        if not ok:
            failures += 1
        print(f"{case['name']:<20} {case['qubits']:>6} {diff:>20.3e}   {fidelity:>10.8f}   {'OK' if ok else 'MISMATCH'}")

    print("-" * 78)
    print(f"\nWorst disagreement across all {len(cases)} circuits: {worst:.3e}")
    print(f"Tolerance: {TOLERANCE:.0e}")

    if failures:
        print(f"\n{failures} circuit(s) did not match.")
        return 1

    print("\nEvery circuit agrees with Qiskit to within floating-point noise.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
