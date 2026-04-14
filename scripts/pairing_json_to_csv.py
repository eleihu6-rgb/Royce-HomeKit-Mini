#!/usr/bin/env python3
"""
Flatten pairing JSON exports under data/input into five CSV files under data/output.

Reads every *.json in the input directory (root must be a JSON array of pairing objects).
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent

NESTED_KEYS = frozenset(
    {
        "pairingDuty",
        "pairingDutyNodes",
        "pairingDutySegments",
        "pairingCompositions",
    }
)


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _normalize_row(d: dict[str, Any]) -> dict[str, str]:
    return {k: _cell(v) for k, v in d.items()}


def _write_csv(
    rows: list[dict[str, str]],
    out_path: Path,
    *,
    first_columns: tuple[str, ...] | None = None,
) -> None:
    all_keys: set[str] = set()
    for r in rows:
        all_keys.update(r.keys())
    if not all_keys:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text("", encoding="utf-8-sig")
        return
    if first_columns:
        head = [c for c in first_columns if c in all_keys]
        tail = sorted(all_keys - set(head))
        fieldnames = head + tail
    else:
        fieldnames = sorted(all_keys)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({fn: r.get(fn, "") for fn in fieldnames})


def _load_pairings(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError(f"{path}: root JSON must be an array, got {type(data).__name__}")
    return [x for x in data if isinstance(x, dict)]


def export_pairings(input_dir: Path, output_dir: Path) -> None:
    pairing_rows: list[dict[str, str]] = []
    duty_rows: list[dict[str, str]] = []
    node_rows: list[dict[str, str]] = []
    segment_rows: list[dict[str, str]] = []
    composition_rows: list[dict[str, str]] = []

    json_files = sorted(input_dir.glob("*.json"))
    if not json_files:
        raise SystemExit(f"No .json files in {input_dir}")

    for jf in json_files:
        pairings = _load_pairings(jf)
        for p in pairings:
            pid = p.get("pairingId")

            flat = {k: v for k, v in p.items() if k not in NESTED_KEYS}
            pairing_rows.append(_normalize_row(flat))

            for item in p.get("pairingDuty") or []:
                if isinstance(item, dict):
                    duty_rows.append(_normalize_row(item))

            for item in p.get("pairingDutyNodes") or []:
                if isinstance(item, dict):
                    node_rows.append(_normalize_row(item))

            for item in p.get("pairingDutySegments") or []:
                if isinstance(item, dict):
                    merged = {"pairingId": pid, **item}
                    segment_rows.append(_normalize_row(merged))

            for item in p.get("pairingCompositions") or []:
                if isinstance(item, dict):
                    merged = {"pairingId": pid, **item}
                    composition_rows.append(_normalize_row(merged))

    output_dir.mkdir(parents=True, exist_ok=True)
    _write_csv(pairing_rows, output_dir / "f8_pairing.csv")
    _write_csv(duty_rows, output_dir / "f8_pairingduty.csv")
    _write_csv(node_rows, output_dir / "f8_pairingdutynodes.csv")
    _write_csv(segment_rows, output_dir / "f8_pairingdutysegments.csv", first_columns=("pairingId",))
    _write_csv(composition_rows, output_dir / "f8_pairingcompositions.csv", first_columns=("pairingId",))


def main() -> None:
    parser = argparse.ArgumentParser(description="Export pairing JSON arrays to CSV files.")
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "input",
        help="Directory containing *.json pairing exports (default: <repo>/data/input)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "output",
        help="Directory for CSV output (default: <repo>/data/output)",
    )
    args = parser.parse_args()
    if not args.input_dir.is_dir():
        raise SystemExit(f"Input directory does not exist: {args.input_dir}")
    export_pairings(args.input_dir.resolve(), args.output_dir.resolve())
    print(f"Wrote 5 CSV files to {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()
