#!/usr/bin/env python3
"""Normalize DOL LCA disclosure files to a Santa Clara County time series.

The script expects the FY2008-FY2025 DOL workbooks in --raw-dir.  It writes
one consolidated row per Santa Clara County LCA case plus annual and employer
aggregates.  Legacy FY2001-FY2007 CSV extracts can be added later through the
same normalized case CSV schema.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

import openpyxl


SANTA_CLARA_CITIES = {
    "ALVISO",
    "CAMPBELL",
    "COYOTE",
    "CUPERTINO",
    "GILROY",
    "HOLY CITY",
    "LOS ALTOS",
    "LOS ALTOS HILLS",
    "LOS GATOS",
    "MILPITAS",
    "MOFFETT FIELD",
    "MONTE SERENO",
    "MORGAN HILL",
    "MOUNT HAMILTON",
    "MOUNTAIN VIEW",
    "NEW ALMADEN",
    "PALO ALTO",
    "SAN JOSE",
    "SAN MARTIN",
    "SANTA CLARA",
    "SARATOGA",
    "STANFORD",
    "SUNNYVALE",
}

CERTIFIED_STATUSES = {"CERTIFIED", "CERTIFIED-WITHDRAWN"}

SOURCE_URLS = {
    2008: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_Case_Data_FY2008.xlsx",
    2009: "https://www.dol.gov/agencies/eta/foreign-labor/performance",
    2010: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_FY2010.xlsx",
    2011: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_iCert_LCA_FY2011_Q4.xlsx",
    2012: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_FY2012_Q4.xlsx",
    2013: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_FY2013.xlsx",
    2014: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_FY14_Q4.xlsx",
    2015: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_Disclosure_Data_FY15_Q4.xlsx",
    2016: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_Disclosure_Data_FY16.xlsx",
    2017: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_Disclosure_Data_FY17.xlsx",
    2018: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_Disclosure_Data_FY2018_EOY.xlsx",
    2019: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-1B_Disclosure_Data_FY2019.xlsx",
    2020: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2020_Q4.xlsx",
    2021: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2021_Q4.xlsx",
    2022: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2022_Q4.xlsx",
    2023: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2023_Q4.xlsx",
    2024: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2024_Q4.xlsx",
    2025: "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2025_Q4.xlsx",
}

MAIN_FILES = {
    2008: ["H1B_FY2008.xlsx"],
    2009: ["H1B_FY2009_efile.xlsx", "H1B_FY2009_icert.xlsx"],
    **{year: [f"H1B_FY{year}.xlsx"] for year in range(2010, 2020)},
    **{year: [f"LCA_FY{year}_Q{quarter}.xlsx" for quarter in range(1, 5)] for year in range(2020, 2026)},
}

WORKSITE_FILES = {
    2020: "LCA_Worksites_FY2020.xlsx",
    2021: "LCA_Worksites_FY2021.xlsx",
    2022: "LCA_Worksites_FY2022_Q4.xlsx",
    2023: "LCA_Worksites_FY2023_Q4.xlsx",
    2024: "LCA_Worksites_FY2024_Q4.xlsx",
    2025: "LCA_Worksites_FY2025_Q4.xlsx",
}

CASE_FIELDS = [
    "fiscal_year",
    "case_number",
    "case_status",
    "certified",
    "worker_positions_requested",
    "employer_name",
    "job_title",
    "soc_code",
    "soc_title",
    "worksite_cities",
    "worksite_county_reported",
    "location_match_method",
    "source_url",
]


def norm(value: Any) -> str:
    if value is None:
        return ""
    value = str(value).strip().upper()
    return re.sub(r"\s+", " ", value)


def number(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return 0.0


def display_number(value: float) -> int | float:
    return int(value) if value == int(value) else value


def is_h1b(value: Any, assume_h1b: bool = False) -> bool:
    if assume_h1b and not norm(value):
        return True
    return norm(value).replace(" ", "") in {"H-1B", "H1B"}


def scc_match(city: Any, county: Any, state: Any) -> str:
    state_norm = norm(state)
    if state_norm not in {"CA", "CALIFORNIA"}:
        return ""
    county_norm = norm(county).replace(" COUNTY", "")
    if county_norm == "SANTA CLARA":
        return "reported_county"
    if norm(city) in SANTA_CLARA_CITIES:
        return "city_fallback"
    return ""


def iter_sheet(path: Path) -> Iterable[dict[str, Any]]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.active
    rows = sheet.iter_rows(values_only=True)
    headers = [str(value).strip() if value is not None else "" for value in next(rows)]
    try:
        for values in rows:
            yield dict(zip(headers, values))
    finally:
        workbook.close()


def first(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in row and row[name] not in (None, ""):
            return row[name]
    return None


def core_case(year: int, row: dict[str, Any], assume_h1b: bool = False) -> dict[str, Any] | None:
    visa_class = first(row, "VISA_CLASS")
    if not is_h1b(visa_class, assume_h1b=assume_h1b):
        return None
    status = norm(first(row, "CASE_STATUS", "STATUS", "APPROVAL_STATUS"))
    return {
        "fiscal_year": year,
        "case_number": str(first(row, "CASE_NUMBER", "LCA_CASE_NUMBER", "CASE_NO") or "").strip(),
        "case_status": status,
        "certified": status in CERTIFIED_STATUSES,
        "employer_name": str(first(row, "EMPLOYER_NAME", "LCA_CASE_EMPLOYER_NAME", "NAME") or "").strip(),
        "job_title": str(first(row, "JOB_TITLE", "LCA_CASE_JOB_TITLE") or "").strip(),
        "soc_code": str(first(row, "SOC_CODE", "LCA_CASE_SOC_CODE", "JOB_CODE") or "").strip(),
        "soc_title": str(first(row, "SOC_TITLE", "SOC_NAME", "LCA_CASE_SOC_NAME", "OCCUPATIONAL_TITLE") or "").strip(),
    }


def locations_for_legacy(year: int, row: dict[str, Any]) -> list[tuple[Any, Any, Any]]:
    if year <= 2009 and "CITY_1" in row:
        return [(row.get("CITY_1"), None, row.get("STATE_1")), (row.get("CITY_2"), None, row.get("STATE_2"))]
    if year == 2010:
        return [
            (row.get("WORK_LOCATION_CITY1"), None, row.get("WORK_LOCATION_STATE1")),
            (row.get("WORK_LOCATION_CITY2"), None, row.get("WORK_LOCATION_STATE2")),
        ]
    if year <= 2014:
        return [
            (row.get("LCA_CASE_WORKLOC1_CITY"), None, row.get("LCA_CASE_WORKLOC1_STATE")),
            (row.get("LCA_CASE_WORKLOC2_CITY"), None, row.get("LCA_CASE_WORKLOC2_STATE")),
        ]
    return [(row.get("WORKSITE_CITY"), row.get("WORKSITE_COUNTY"), row.get("WORKSITE_STATE"))]


def make_output(case: dict[str, Any], positions: float, cities: set[str], counties: set[str], methods: set[str]) -> dict[str, Any]:
    result = dict(case)
    result.update(
        {
            "certified": "Yes" if case["certified"] else "No",
            "worker_positions_requested": display_number(positions),
            "worksite_cities": "; ".join(sorted(cities)),
            "worksite_county_reported": "; ".join(sorted(counties)),
            "location_match_method": "; ".join(sorted(methods)),
            "source_url": SOURCE_URLS[case["fiscal_year"]],
        }
    )
    return result


def process_2008_2018(raw_dir: Path, year: int) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for filename in MAIN_FILES[year]:
        assume_h1b = year in {2008, 2010} or (year == 2009 and "efile" in filename)
        for row in iter_sheet(raw_dir / filename):
            case = core_case(year, row, assume_h1b=assume_h1b)
            if not case:
                continue
            matches = []
            for city, county, state in locations_for_legacy(year, row):
                method = scc_match(city, county, state)
                if method:
                    matches.append((norm(city), norm(county), method))
            if not matches:
                continue
            workers = number(first(row, "TOTAL_WORKER_POSITIONS", "TOTAL_WORKERS", "TOTAL WORKERS", "NBR_IMMIGRANTS"))
            output.append(
                make_output(
                    case,
                    workers if case["certified"] else 0,
                    {city for city, _, _ in matches if city},
                    {county for _, county, _ in matches if county},
                    {method for _, _, method in matches},
                )
            )
    return output


def process_2019(raw_dir: Path) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in iter_sheet(raw_dir / MAIN_FILES[2019][0]):
        case = core_case(2019, row)
        if not case:
            continue
        matches: list[tuple[str, str, str, float]] = []
        for index in range(1, 11):
            city = row.get(f"WORKSITE_CITY_{index}")
            county = row.get(f"WORKSITE_COUNTY_{index}")
            state = row.get(f"WORKSITE_STATE_{index}")
            method = scc_match(city, county, state)
            if method:
                matches.append((norm(city), norm(county), method, number(row.get(f"WORKSITE_WORKERS_{index}"))))
        if not matches:
            continue
        positions = sum(item[3] for item in matches)
        total_positions = number(row.get("TOTAL_WORKER_POSITIONS"))
        if total_positions and positions > total_positions:
            positions = total_positions
        if positions == 0 and len(matches) == 1:
            positions = total_positions
        output.append(
            make_output(
                case,
                positions if case["certified"] else 0,
                {item[0] for item in matches if item[0]},
                {item[1] for item in matches if item[1]},
                {item[2] for item in matches},
            )
        )
    return output


def process_2020_2025(raw_dir: Path, year: int) -> list[dict[str, Any]]:
    cases: dict[str, dict[str, Any]] = {}
    for filename in MAIN_FILES[year]:
        for row in iter_sheet(raw_dir / filename):
            case = core_case(year, row)
            if case and case["case_number"]:
                cases[case["case_number"]] = case

    matched: dict[str, dict[str, Any]] = {}
    for row in iter_sheet(raw_dir / WORKSITE_FILES[year]):
        case_number = str(row.get("CASE_NUMBER") or "").strip()
        if case_number not in cases:
            continue
        method = scc_match(row.get("WORKSITE_CITY"), row.get("WORKSITE_COUNTY"), row.get("WORKSITE_STATE"))
        if not method:
            continue
        item = matched.setdefault(case_number, {"positions": 0.0, "cities": set(), "counties": set(), "methods": set()})
        item["positions"] += number(row.get("WORKSITE_WORKERS"))
        if norm(row.get("WORKSITE_CITY")):
            item["cities"].add(norm(row.get("WORKSITE_CITY")))
        if norm(row.get("WORKSITE_COUNTY")):
            item["counties"].add(norm(row.get("WORKSITE_COUNTY")))
        item["methods"].add(method)

    output = []
    for case_number, item in matched.items():
        case = cases[case_number]
        output.append(
            make_output(
                case,
                item["positions"] if case["certified"] else 0,
                item["cities"],
                item["counties"],
                item["methods"],
            )
        )
    return output


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def aggregate(cases: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    annual = []
    for year in sorted({int(row["fiscal_year"]) for row in cases}):
        rows = [row for row in cases if int(row["fiscal_year"]) == year]
        certified = [row for row in rows if row["certified"] == "Yes"]
        annual.append(
            {
                "fiscal_year": year,
                "all_lca_cases": len(rows),
                "certified_lca_cases": len(certified),
                "certified_worker_positions_requested": display_number(sum(number(row["worker_positions_requested"]) for row in certified)),
                "denied_lca_cases": sum(row["case_status"] == "DENIED" for row in rows),
                "withdrawn_lca_cases": sum(row["case_status"] == "WITHDRAWN" for row in rows),
                "source_url": SOURCE_URLS.get(year, "https://doi.org/10.3886/E100840V2"),
            }
        )

    employers: dict[str, dict[str, Any]] = defaultdict(lambda: {"cases": 0, "positions": 0.0, "first": 9999, "last": 0})
    for row in cases:
        if row["certified"] != "Yes":
            continue
        name = norm(row["employer_name"]) or "(BLANK EMPLOYER NAME)"
        item = employers[name]
        item["cases"] += 1
        item["positions"] += number(row["worker_positions_requested"])
        item["first"] = min(item["first"], int(row["fiscal_year"]))
        item["last"] = max(item["last"], int(row["fiscal_year"]))
    employer_rows = [
        {
            "employer_name": name,
            "certified_lca_cases": values["cases"],
            "certified_worker_positions_requested": display_number(values["positions"]),
            "first_fiscal_year": values["first"],
            "last_fiscal_year": values["last"],
        }
        for name, values in employers.items()
    ]
    employer_rows.sort(key=lambda row: (-number(row["certified_worker_positions_requested"]), row["employer_name"]))
    return annual, employer_rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("/tmp/h1b_dol_raw"))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs/h1b_santa_clara_25_year"))
    parser.add_argument("--start-year", type=int, default=2008)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--years", type=str, help="Comma-separated fiscal years to refresh while reusing the existing case CSV for other years")
    args = parser.parse_args()

    selected_years = (
        sorted({int(value.strip()) for value in args.years.split(",") if value.strip()})
        if args.years
        else list(range(args.start_year, args.end_year + 1))
    )
    all_cases: list[dict[str, Any]] = []
    existing_case_path = args.output_dir / "santa_clara_h1b_cases_2008_2025.csv"
    if args.years and existing_case_path.exists():
        with existing_case_path.open(newline="", encoding="utf-8") as handle:
            all_cases.extend(
                row for row in csv.DictReader(handle) if int(row["fiscal_year"]) not in selected_years
            )
    quality = []
    for year in selected_years:
        print(f"Processing FY{year}...", flush=True)
        if year <= 2018:
            cases = process_2008_2018(args.raw_dir, year)
            method_note = "Reported county where available; otherwise Santa Clara County city-name fallback. Multi-worksite worker totals are not allocated before FY2019."
        elif year == 2019:
            cases = process_2019(args.raw_dir)
            method_note = "Reported county where available; otherwise city fallback; worksite allocations summed across up to 10 worksites and capped at the application's stated total to correct impossible source values."
        else:
            cases = process_2020_2025(args.raw_dir, year)
            method_note = "DOL worksite allocation file joined to H-1B cases; reported county where available, otherwise city fallback."
        all_cases.extend(cases)
        quality.append({"fiscal_year": year, "matched_cases": len(cases), "methodology": method_note})
        print(f"  matched {len(cases):,} Santa Clara County cases", flush=True)

    all_cases.sort(key=lambda row: (int(row["fiscal_year"]), row["case_number"]))
    annual, employers = aggregate(all_cases)
    write_csv(args.output_dir / "santa_clara_h1b_cases_2008_2025.csv", all_cases, CASE_FIELDS)
    write_csv(
        args.output_dir / "santa_clara_h1b_annual_2008_2025.csv",
        annual,
        ["fiscal_year", "all_lca_cases", "certified_lca_cases", "certified_worker_positions_requested", "denied_lca_cases", "withdrawn_lca_cases", "source_url"],
    )
    write_csv(
        args.output_dir / "santa_clara_h1b_employers_2008_2025.csv",
        employers,
        ["employer_name", "certified_lca_cases", "certified_worker_positions_requested", "first_fiscal_year", "last_fiscal_year"],
    )
    write_csv(args.output_dir / "data_quality_2008_2025.csv", quality, ["fiscal_year", "matched_cases", "methodology"])
    with (args.output_dir / "run_summary.json").open("w", encoding="utf-8") as handle:
        json.dump({"case_rows": len(all_cases), "years": [args.start_year, args.end_year], "annual": annual}, handle, indent=2)


if __name__ == "__main__":
    main()
