# U.S. county Deck.gl foundation

A small, reusable TypeScript + Deck.gl county choropleth using the 2023 Census
1:5,000,000 cartographic boundary file. The metric selector currently includes
county population, PPP approved amount, FBI-reported offenses, Medicaid
coverage estimates, and Medicaid provider spending, plus categorical
race/ethnicity views.
The application uses direct DOM updates and persistent `Deck` instances; it has
no UI framework or component runtime.

Every metric and categorical overlay has a shareable deep link using the
`metric` query parameter. For example, selecting the H-1B layer updates the URL
to `?metric=<metric-id>`. Loading that URL restores the selection, and browser
Back and Forward move through previous dropdown choices.

Click a county to open a focused detail overlay. The overlay fits the selected
geometry into its own independently interactive Deck.gl view and exposes the
county metric, water area, GEOID, and state. Close it with the × button, the
Escape key, or a click outside the panel.

## Run locally

```bash
npm install
npm run dev
```

## County metric contract

`CountyChoropleth` receives geometry and metric data separately. Create a
`CountyMetric` whose `values` map is keyed by the Census five-digit county
`GEOID`, then pass it to the map:

```ts
const metric = {
  id: 'example',
  label: 'Example metric',
  values: new Map([
    ['17031', 42],
    ['06037', 81],
  ]),
  formatValue: (value: number) => value.toFixed(1),
};

const map = new CountyChoropleth(
  container,
  counties,
  metric,
  (county) => showCountyDetail(county),
);
```

Call `setMetric(metric)` to update the persistent national and detail Deck
instances without remounting the map. The long-lived choropleth object owns
rendering, hover, selection highlighting, and the legend; the application owns
loading, metric construction, the selector, and selected-county state.
`CountyDetailOverlay` is a separate detail surface, so county-specific layers
such as Census tracts or local facilities can be added without coupling them to
the national layer. Its Deck.gl renderer is measured and warmed while hidden,
then reused across selections so the blurred detail surface opens promptly.

## Data

`public/data/us-counties-2023.geojson` is derived from the included Census
shapefile and retains only the fields used by the visualization. The source
uses NAD83; the browser-ready file is explicitly written as EPSG:4326.

`public/data/us-states-2023.geojson` is the matching Census 1:5,000,000 state
cartographic boundary file. It is rendered as a separate, thicker outline above
the county polygons so state borders remain visually distinct from county
borders at every zoom level.

`public/data/county-population-2024.json` contains 3,144 county and
county-equivalent estimates from the Census Population Estimates Program. All
3,144 records join to the boundary file. The source does not provide matching
records for American Samoa, Guam, the Northern Mariana Islands, Puerto Rico, or
the U.S. Virgin Islands, so those areas intentionally display as no data.

`public/data/county-demographics-2024.json` adds matching July 1, 2024 sex,
race, and Hispanic-origin estimates to the county detail overlay. The artifact
retains age-65+ fields for analysis, but the population popup does not display
them. Its race/ethnicity bars are mutually exclusive: Hispanic/Latino of any race plus
six non-Hispanic race groups. This ensures the categories sum to the displayed
county population rather than double-counting people.

The main Metric selector includes a categorical “Largest race & ethnicity
group” view. It colors every covered county by its largest mutually exclusive
group, even when that group is below 50% of residents. Groups that do not lead
in any county are omitted from the legend.

`public/data/county-crime-2025.json` aggregates 2025 FBI National
Incident-Based Reporting System (NIBRS) Group A offenses to Census county
GEOIDs. It covers 2,982 counties and county equivalents. Selecting “Reported
offenses” colors counties by offense count and changes the county detail card
to show reported incidents plus known-offender sex, ethnicity, and race.
Unknown and not-specified demographic values remain visible.

NIBRS is a voluntary law-enforcement reporting system, so these values are not
counts of every crime committed. Reports are attributed to the county
containing the FBI-published agency location; multi-county agencies therefore
have approximate county attribution. Counties without attributed 2025 reports
display as no data, not zero.

The “Largest known-offender race” metric colors each covered county by the
largest reported known-offender race category, even when that category is
below 50%. Unknown and not-specified race records remain visible in the county
profile but do not determine the map color.

`public/data/county-ppp.json` aggregates all 2020–2021 loans in the local
`ppp-data` PostgreSQL database to Census county GEOIDs. Selecting “PPP approved
amount” colors counties by current approval amount and changes the county
detail card to show loan count, approved and forgiveness amounts, jobs
reported, and borrower-reported owner gender, ethnicity, and race. Approved
amount and forgiveness are deliberately shown as separate measures, and
unanswered demographic fields remain visible.

County names provide the primary join. The builder uses official Census
ZIP-to-county relationship files for ambiguous independent cities and to map
Connecticut's former counties into the planning regions used by the 2023
boundary file. Of 11,468,210 database rows, 11,467,137 are represented in the
artifact; 630 lack a county and 443 have county/ZIP values that cannot be
matched.

`public/data/county-medicaid-2024.json` aggregates the HHS Medicaid Provider
Spending by HCPCS data in the local `medicaid_fraud` database. Selecting
“Medicaid paid amount” colors counties by 2024 Medicaid and CHIP payments and
changes the detail card to show attributed providers, claim lines, paid amount
per line, published aggregate cells, and negative adjustment cells.

This layer is provider spending, not evidence or a finding of fraud. Spending
is attributed to the servicing provider's current NPPES practice ZIP, with the
billing provider as fallback; it does not represent patient residence or
necessarily the service location. The source suppresses provider/procedure/month
cells with fewer than 12 patients or fewer than 12 claim lines. The artifact
maps $190.3 billion to 3,143 counties. Another $1.94 billion is associated with
1,062 postal ZIPs that have no Census ZCTA-to-county relationship, most often
institutional or unique-use ZIP codes.

`public/data/county-medicaid-enrollment-2024.json` and its CSV companion contain
county estimates from Census ACS table C27007. The map offers both estimated
enrollment and the estimated share of the civilian noninstitutionalized
population with Medicaid or other means-tested public coverage. These are 2024
ACS 5-year estimates pooled across 2020–2024, not administrative enrollment or
a point-in-time caseload. The artifact covers 3,222 county equivalents in all
50 states, the District of Columbia, and Puerto Rico and retains 90% margins of
error plus under-19, age 19–64, and age 65+ estimates.

The “Medicaid paid per estimated enrollee” layer divides the 2024 HHS provider
payments attributed to provider practice locations by the ACS county resident
coverage estimate. Selecting a county shows the total paid amount, estimated
covered residents, and calculated ratio together. Because provider location can
differ from patient residence and the ACS denominator is a pooled survey
estimate that includes other means-tested public coverage, this is an
analytical comparison rather than an official CMS per-member cost.

`public/data/county-h1b-fy2025.json` combines the four quarterly FY2025 DOL
Labor Condition Application disclosure files with the full-year worksite file.
It filters to H-1B cases and maps certified worksite placements to 2,545 county
equivalents using reported county names and Census ZIP relationships. County
profiles include certified applications and placements, annualized offered and
prevailing wages, secondary-entity placements, and the leading employers and
occupations. A certified LCA is a wage attestation—not a USCIS petition
approval, confirmed hire, or count of unique people. The large source
workbooks remain local and are excluded from Git; the compact artifact,
converter, source notes, and validation report are versioned.

The compact population artifact is reproducible from the official Census CSV:

```bash
node scripts/build-population-metric.mjs \
  co-est2024-alldata.csv \
  public/data/county-population-2024.json
```

The demographic artifact is generated from `CC-EST2024-ALLDATA`:

```bash
node scripts/build-county-demographics.mjs \
  cc-est2024-alldata.csv \
  public/data/county-demographics-2024.json
```

The crime builder consumes the FBI's state-level 2025 NIBRS ZIP packages. The
first argument is a temporary JSON object mapping full state names to the
signed package URLs returned by the FBI Crime Data Explorer downloads page.
ZIP files are cached locally so reruns do not download them again:

```bash
node scripts/build-county-crime.mjs \
  nibrs-2025-links.json \
  public/data/us-counties-2023.geojson \
  public/data/county-crime-2025.json \
  /tmp/nibrs-2025-cache
```

The PPP artifact is generated from the local `ppp-data` database. The builder
downloads the official Census ZIP relationship files needed for fallback
county attribution:

```bash
node scripts/build-county-ppp.mjs \
  public/data/us-counties-2023.geojson \
  public/data/county-ppp.json \
  ppp-data
```

The Medicaid artifact is generated with a temporary read-only aggregation of
the local database and the official Census ZIP relationship files:

```bash
node scripts/build-county-medicaid.mjs \
  public/data/us-counties-2023.geojson \
  public/data/county-medicaid-2024.json \
  medicaid_fraud \
  2024
```

Future election and HHS inputs should be normalized to the same metric
file shape: metadata plus one numeric value per five-digit county GEOID. Raw
records must be aggregated to county level before entering the browser bundle;
the map should not contain source-specific joins or aggregation logic.
