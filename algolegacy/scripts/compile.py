"""
compile.py — Compile AlgoLegacy contract to TEAL artifacts
===========================================================
Usage:
    python scripts/compile.py

Outputs to contracts/artifacts/:
    AlgoLegacy.approval.teal
    AlgoLegacy.clear.teal
    AlgoLegacy.abi.json
"""

import sys, json, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from contracts.algolegacy import app

out = pathlib.Path(__file__).parent.parent / "contracts" / "artifacts"
out.mkdir(exist_ok=True)

spec = app.build()

(out / "AlgoLegacy.approval.teal").write_text(spec.approval_program)
(out / "AlgoLegacy.clear.teal").write_text(spec.clear_program)
(out / "AlgoLegacy.abi.json").write_text(json.dumps(spec.contract.dictify(), indent=2))

print("✅ Artifacts written to contracts/artifacts/")
print(f"   Approval TEAL : {len(spec.approval_program.splitlines())} lines")
print(f"   Methods       : {[m.name for m in spec.contract.methods]}")
