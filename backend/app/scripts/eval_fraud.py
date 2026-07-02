"""CLI: evaluate the fraud classifier (confusion matrix + P/R/F1 + ROC-AUC).

    docker exec shopflow-backend-1 python -m app.scripts.eval_fraud --samples 5000
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.eval.fraud_eval import evaluate_fraud
from app.ml.fraud import MODEL_PATH


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the fraud classifier.")
    parser.add_argument("--samples", type=int, default=5000)
    parser.add_argument("--fraud-rate", dest="fraud_rate", type=float, default=0.12)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--threshold", type=float, default=None)
    parser.add_argument("--out", type=Path, default=Path("eval_reports/fraud_eval.json"))
    args = parser.parse_args()

    scorer = "trained booster" if MODEL_PATH.exists() else "heuristic fallback (no artifact)"
    report = evaluate_fraud(
        samples=args.samples,
        fraud_rate=args.fraud_rate,
        seed=args.seed,
        threshold=args.threshold,
    )
    report["scorer"] = scorer

    cm = report["confusion_matrix"]
    m = report["metrics"]
    print("\nFraud eval — scorer: %s" % scorer)
    print("samples=%d positives=%d threshold=%s"
          % (report["samples"], report["positives"], report["threshold"]))
    print("\nConfusion matrix:")
    print("                 pred_fraud  pred_legit")
    print("  actual_fraud   %10d  %10d" % (cm["tp"], cm["fn"]))
    print("  actual_legit   %10d  %10d" % (cm["fp"], cm["tn"]))
    print("\nprecision=%.4f recall=%.4f f1=%.4f accuracy=%.4f roc_auc=%.4f"
          % (m["precision"], m["recall"], m["f1"], m["accuracy"], m["roc_auc"]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2))
    print("\nReport written to %s" % args.out)


if __name__ == "__main__":
    main()
