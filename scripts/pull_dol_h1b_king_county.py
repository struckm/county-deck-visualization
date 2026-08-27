#!/usr/bin/env python3
"""Aggregate King County, Washington H-1B LCA trends from downloaded DOL files."""

from __future__ import annotations

import argparse
import collections
import csv
import importlib.util
from pathlib import Path
from typing import Any


KING_COUNTY_CITIES = {
    "AUBURN", "BELLEVUE", "BLACK DIAMOND", "BOTHELL", "BURIEN", "CARNATION",
    "CLYDE HILL", "COVINGTON", "DES MOINES", "DUVALL", "ENUMCLAW", "FEDERAL WAY",
    "HUNTS POINT", "ISSAQUAH", "KENMORE", "KENT", "KIRKLAND", "LAKE FOREST PARK",
    "MAPLE VALLEY", "MEDINA", "MERCER ISLAND", "MILTON", "NEWCASTLE", "NORMANDY PARK",
    "NORTH BEND", "PACIFIC", "REDMOND", "RENTON", "SAMMAMISH", "SEATAC", "SEATTLE",
    "SHORELINE", "SKYKOMISH", "SNOQUALMIE", "TUKWILA", "WOODINVILLE", "YARROW POINT",
}


def load_base_module() -> Any:
    path = Path(__file__).with_name("pull_dol_h1b_santa_clara.py")
    spec = importlib.util.spec_from_file_location("dol_h1b_base", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("/tmp/h1b_dol_raw"))
    parser.add_argument("--output", type=Path, default=Path("outputs/h1b_king_county/h1b_worker_positions_2008_2025.csv"))
    args = parser.parse_args()

    base = load_base_module()

    def king_match(city: Any, county: Any, state: Any) -> str | None:
        city_value = base.norm(city)
        county_value = base.norm(county)
        state_value = base.norm(state)
        if state_value not in {"WA", "WASHINGTON"}:
            return None
        if county_value:
            return "Reported county" if county_value in {"KING", "KING COUNTY"} else None
        if city_value in KING_COUNTY_CITIES:
            return "City-name fallback"
        return None

    base.scc_match = king_match
    rows: list[dict[str, Any]] = []
    for year in range(2008, 2026):
        print(f"Processing FY{year}...", flush=True)
        if year <= 2018:
            cases = base.process_2008_2018(args.raw_dir, year)
        elif year == 2019:
            cases = base.process_2019(args.raw_dir)
        else:
            cases = base.process_2020_2025(args.raw_dir, year)
        certified = [row for row in cases if row["certified"] == "Yes"]
        employer_positions: dict[str, float] = collections.defaultdict(float)
        for row in certified:
            employer = base.norm(row["employer_name"]) or "(BLANK EMPLOYER NAME)"
            employer_positions[employer] += base.number(row["worker_positions_requested"])
        top_employers = sorted(employer_positions.items(), key=lambda item: (-item[1], item[0]))[:3]
        rows.append({
            "fiscal_year": year,
            "all_lca_cases": len(cases),
            "certified_lca_cases": len(certified),
            "certified_worker_positions_requested": base.display_number(
                sum(base.number(row["worker_positions_requested"]) for row in certified)
            ),
            "top_employer_1": top_employers[0][0],
            "top_employer_1_positions": base.display_number(top_employers[0][1]),
            "top_employer_2": top_employers[1][0],
            "top_employer_2_positions": base.display_number(top_employers[1][1]),
            "top_employer_3": top_employers[2][0],
            "top_employer_3_positions": base.display_number(top_employers[2][1]),
        })
        print(f"  {len(cases):,} cases; {rows[-1]['certified_worker_positions_requested']:,} certified worker positions", flush=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
