"""
Quantum Learning API.

Deliberately small. The learning loop runs entirely on the device, so this server is
not in the critical path — it exists for the things a single device genuinely cannot
do: keep progress across devices, let an instructor see a cohort, and run circuits
too large for the browser on real SDK backends.

Run:  uvicorn server.main:app --reload --port 8000
"""

from __future__ import annotations

import json
import math
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB = Path(__file__).parent / "quantum_learning.db"
MAX_SERVER_QUBITS = 20

app = FastAPI(title="Quantum Learning API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5180", "http://localhost:4173", "capacitor://localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------- storage

def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(db()) as conn, conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS learner (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                cohort TEXT DEFAULT 'default',
                created REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mastery (
                learner_id TEXT NOT NULL,
                concept TEXT NOT NULL,
                value REAL NOT NULL,
                updated REAL NOT NULL,
                PRIMARY KEY (learner_id, concept)
            );
            CREATE TABLE IF NOT EXISTS submission (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                learner_id TEXT NOT NULL,
                challenge_id TEXT NOT NULL,
                passed INTEGER NOT NULL,
                fidelity REAL NOT NULL,
                circuit TEXT NOT NULL,
                at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sub_learner ON submission(learner_id);
            """
        )


init_db()


# ----------------------------------------------------------------- models

class GateOp(BaseModel):
    name: str
    qubits: list[int]
    params: list[float] = Field(default_factory=list)


class Circuit(BaseModel):
    name: str = "Untitled"
    qubits: int = Field(ge=1, le=MAX_SERVER_QUBITS)
    ops: list[GateOp] = Field(default_factory=list)


class SimRequest(BaseModel):
    circuit: Circuit
    backend: Literal["qiskit", "pennylane", "cirq"] = "qiskit"
    shots: int = Field(default=1024, ge=1, le=100_000)


class ProgressIn(BaseModel):
    learner_id: str
    name: str = "Learner"
    cohort: str = "default"
    mastery: dict[str, float]


class SubmissionIn(BaseModel):
    learner_id: str
    challenge_id: str
    passed: bool
    fidelity: float
    circuit: Circuit


# ----------------------------------------------------------------- backends

def _qiskit_run(c: Circuit, shots: int) -> dict[str, Any]:
    from qiskit import QuantumCircuit
    from qiskit.quantum_info import Statevector

    qc = QuantumCircuit(c.qubits)
    calls = {
        "i": lambda q, p: qc.id(q[0]), "x": lambda q, p: qc.x(q[0]), "y": lambda q, p: qc.y(q[0]),
        "z": lambda q, p: qc.z(q[0]), "h": lambda q, p: qc.h(q[0]), "s": lambda q, p: qc.s(q[0]),
        "sdg": lambda q, p: qc.sdg(q[0]), "t": lambda q, p: qc.t(q[0]), "tdg": lambda q, p: qc.tdg(q[0]),
        "rx": lambda q, p: qc.rx(p[0], q[0]), "ry": lambda q, p: qc.ry(p[0], q[0]),
        "rz": lambda q, p: qc.rz(p[0], q[0]), "p": lambda q, p: qc.p(p[0], q[0]),
        "cx": lambda q, p: qc.cx(q[0], q[1]), "cy": lambda q, p: qc.cy(q[0], q[1]),
        "cz": lambda q, p: qc.cz(q[0], q[1]), "swap": lambda q, p: qc.swap(q[0], q[1]),
        "ccx": lambda q, p: qc.ccx(q[0], q[1], q[2]), "cswap": lambda q, p: qc.cswap(q[0], q[1], q[2]),
        "barrier": lambda q, p: None, "measure": lambda q, p: None,
    }
    for o in c.ops:
        fn = calls.get(o.name)
        if fn is None:
            raise HTTPException(400, f"Backend does not support gate '{o.name}'.")
        fn(o.qubits, o.params)

    sv = Statevector.from_instruction(qc)
    probs = sv.probabilities()
    counts = {
        format(i, f"0{c.qubits}b"): int(round(p * shots))
        for i, p in enumerate(probs) if p > 1e-12
    }
    return {
        "re": [float(z.real) for z in sv.data],
        "im": [float(z.imag) for z in sv.data],
        "counts": counts,
    }


def _pennylane_run(c: Circuit, shots: int) -> dict[str, Any]:
    import pennylane as qml
    import numpy as np

    dev = qml.device("default.qubit", wires=c.qubits)

    @qml.qnode(dev)
    def circuit():
        for o in c.ops:
            q, p = o.qubits, o.params
            match o.name:
                case "h": qml.Hadamard(wires=q[0])
                case "x": qml.PauliX(wires=q[0])
                case "y": qml.PauliY(wires=q[0])
                case "z": qml.PauliZ(wires=q[0])
                case "s": qml.S(wires=q[0])
                case "t": qml.T(wires=q[0])
                case "rx": qml.RX(p[0], wires=q[0])
                case "ry": qml.RY(p[0], wires=q[0])
                case "rz": qml.RZ(p[0], wires=q[0])
                case "p": qml.PhaseShift(p[0], wires=q[0])
                case "cx": qml.CNOT(wires=[q[0], q[1]])
                case "cz": qml.CZ(wires=[q[0], q[1]])
                case "swap": qml.SWAP(wires=[q[0], q[1]])
                case "ccx": qml.Toffoli(wires=[q[0], q[1], q[2]])
                case "barrier" | "measure": pass
                case _: raise HTTPException(400, f"PennyLane backend does not support '{o.name}'.")
        return qml.state()

    # PennyLane orders wires big-endian; reverse to match our little-endian indexing.
    state = np.asarray(circuit()).reshape([2] * c.qubits).transpose(list(range(c.qubits))[::-1]).reshape(-1)
    probs = np.abs(state) ** 2
    counts = {
        format(i, f"0{c.qubits}b"): int(round(float(p) * shots))
        for i, p in enumerate(probs) if p > 1e-12
    }
    return {"re": [float(z.real) for z in state], "im": [float(z.imag) for z in state], "counts": counts}


BACKENDS = {"qiskit": _qiskit_run, "pennylane": _pennylane_run}


# ----------------------------------------------------------------- routes

@app.get("/health")
def health() -> dict[str, Any]:
    available = []
    for name in ("qiskit", "pennylane", "cirq"):
        try:
            __import__(name)
            available.append(name)
        except ImportError:
            pass
    return {"ok": True, "backends": available, "max_qubits": MAX_SERVER_QUBITS}


@app.post("/simulate")
def simulate(req: SimRequest) -> dict[str, Any]:
    """Run a circuit on a real SDK. Used for circuits too large for the browser,
    and to show the same circuit producing the same result across three frameworks."""
    fn = BACKENDS.get(req.backend)
    if fn is None:
        raise HTTPException(400, f"Backend '{req.backend}' is not available on this server.")
    started = time.perf_counter()
    try:
        out = fn(req.circuit, req.shots)
    except HTTPException:
        raise
    except ImportError as exc:
        raise HTTPException(503, f"{req.backend} is not installed on the server: {exc}") from exc
    out["backend"] = req.backend
    out["ms"] = round((time.perf_counter() - started) * 1000, 2)
    return out


@app.post("/progress")
def save_progress(p: ProgressIn) -> dict[str, Any]:
    now = time.time()
    with closing(db()) as conn, conn:
        conn.execute(
            "INSERT INTO learner(id, name, cohort, created) VALUES(?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, cohort=excluded.cohort",
            (p.learner_id, p.name, p.cohort, now),
        )
        for concept, value in p.mastery.items():
            conn.execute(
                "INSERT INTO mastery(learner_id, concept, value, updated) VALUES(?,?,?,?) "
                "ON CONFLICT(learner_id, concept) DO UPDATE SET value=excluded.value, updated=excluded.updated",
                (p.learner_id, concept, float(value), now),
            )
    return {"saved": True, "concepts": len(p.mastery)}


@app.get("/progress/{learner_id}")
def get_progress(learner_id: str) -> dict[str, Any]:
    with closing(db()) as conn:
        rows = conn.execute("SELECT concept, value FROM mastery WHERE learner_id=?", (learner_id,)).fetchall()
        subs = conn.execute(
            "SELECT challenge_id, passed, fidelity, at FROM submission WHERE learner_id=? ORDER BY at DESC LIMIT 50",
            (learner_id,),
        ).fetchall()
    return {
        "mastery": {r["concept"]: r["value"] for r in rows},
        "submissions": [dict(r) for r in subs],
    }


@app.post("/submission")
def record_submission(s: SubmissionIn) -> dict[str, Any]:
    with closing(db()) as conn, conn:
        conn.execute(
            "INSERT INTO submission(learner_id, challenge_id, passed, fidelity, circuit, at) VALUES(?,?,?,?,?,?)",
            (s.learner_id, s.challenge_id, int(s.passed), s.fidelity, json.dumps(s.circuit.model_dump()), time.time()),
        )
    return {"recorded": True}


@app.get("/cohort/{cohort}")
def cohort(cohort: str) -> dict[str, Any]:
    """What an instructor actually needs: which concept is this class failing."""
    with closing(db()) as conn:
        learners = conn.execute("SELECT id, name FROM learner WHERE cohort=?", (cohort,)).fetchall()
        ids = [r["id"] for r in learners]
        if not ids:
            return {"learners": [], "weakest": []}
        marks = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT learner_id, concept, value FROM mastery WHERE learner_id IN ({marks})", ids
        ).fetchall()

    by_learner: dict[str, dict[str, float]] = {i: {} for i in ids}
    totals: dict[str, list[float]] = {}
    for r in rows:
        by_learner[r["learner_id"]][r["concept"]] = r["value"]
        totals.setdefault(r["concept"], []).append(r["value"])

    weakest = sorted(
        ({"concept": c, "average": sum(v) / len(v)} for c, v in totals.items()),
        key=lambda x: x["average"],
    )
    return {
        "learners": [{"id": r["id"], "name": r["name"], "mastery": by_learner[r["id"]]} for r in learners],
        "weakest": weakest,
    }


@app.get("/crosscheck")
def crosscheck_report() -> dict[str, Any]:
    """The stored result of comparing our simulator against Qiskit."""
    path = Path(__file__).parent / "fixtures" / "crosscheck.json"
    if not path.exists():
        raise HTTPException(404, "Cross-check fixture has not been generated yet.")
    data = json.loads(path.read_text(encoding="utf-8"))
    return {"generated": data.get("generated"), "circuits": len(data.get("cases", []))}
