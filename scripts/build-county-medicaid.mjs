import {readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const [countyGeoJsonPath, outputPath, database = 'medicaid_fraud', yearArg = '2024'] =
  process.argv.slice(2);
if (!countyGeoJsonPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/build-county-medicaid.mjs <county GeoJSON> <output JSON> [database] [year]',
  );
}
const year = Number(yearArg);
if (!Number.isInteger(year)) throw new Error(`Invalid year: ${yearArg}`);

const countyGeoJson = JSON.parse(await readFile(countyGeoJsonPath, 'utf8'));
const validGeoids = new Set(
  countyGeoJson.features.map((feature) => feature.properties.GEOID),
);
const zipCounties = await loadZipCounties(validGeoids);
const query = String.raw`
create temp table provider_spending as
select
  coalesce(
    case when servicing_provider_npi_num ~ '^[0-9]{10}$' then servicing_provider_npi_num end,
    case when billing_provider_npi_num ~ '^[0-9]{10}$' then billing_provider_npi_num end
  ) as npi,
  sum(total_paid) as paid,
  sum(total_claim_lines) as claim_lines,
  count(*) as service_cells,
  count(*) filter (where total_paid < 0) as adjustment_cells
from fraud.medicaid_provider_spending
where claim_year = ${year}
  and (
    servicing_provider_npi_num ~ '^[0-9]{10}$'
    or billing_provider_npi_num ~ '^[0-9]{10}$'
  )
group by 1;

analyze provider_spending;

copy (
  select
    left(regexp_replace(r.ploczip, '[^0-9]', '', 'g'), 5) as zip,
    count(*) as providers,
    sum(s.paid) as paid,
    sum(s.claim_lines) as claim_lines,
    sum(s.service_cells) as service_cells,
    sum(s.adjustment_cells) as adjustment_cells
  from provider_spending s
  join fraud.npi_provider_raw r on r.npi = s.npi
  where r.ploccountry = 'US'
    and left(regexp_replace(r.ploczip, '[^0-9]', '', 'g'), 5) ~ '^[0-9]{5}$'
  group by 1
  order by 1
) to stdout with (format csv, delimiter E'\t');
`;

const psql = spawnSync(
  '/opt/homebrew/opt/libpq/bin/psql',
  [
    '-h',
    'localhost',
    '-p',
    '5432',
    '-d',
    database,
    '-q',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    query,
  ],
  {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
);
if (psql.status !== 0) {
  throw new Error(psql.stderr || `psql exited with status ${psql.status}`);
}

const counties = {};
const unmatched = [];
for (const line of psql.stdout.trim().split('\n')) {
  if (!line) continue;
  const [zip, ...rawValues] = line.split('\t');
  const geoid = zipCounties.get(zip);
  const values = rawValues.map(Number);
  if (!geoid) {
    unmatched.push({zip, providers: values[0], paid: values[1]});
    continue;
  }
  const county = (counties[geoid] ??= emptyCounty());
  county.providers += values[0];
  county.paid += values[1];
  county.claimLines += values[2];
  county.serviceCells += values[3];
  county.adjustmentCells += values[4];
}

for (const county of Object.values(counties)) {
  county.paid = roundMoney(county.paid);
}
const sortedCounties = Object.fromEntries(
  Object.entries(counties).sort(([left], [right]) => left.localeCompare(right)),
);
const dataset = {
  id: 'medicaid-paid-amount',
  label: 'Medicaid paid amount',
  description:
    `Medicaid and CHIP payments for outpatient and professional claim lines attributed to provider practice location in ${year}`,
  vintage: String(year),
  source: {
    label: 'HHS Open Data Medicaid Provider Spending by HCPCS',
    url: 'https://opendata.hhs.gov/datasets/medicaid-provider-spending',
  },
  caveat:
    'These are aggregate Medicaid and CHIP payments, not findings of fraud. Geography reflects the provider practice ZIP in NPPES, not the patient residence or service location. The source suppresses cells with fewer than 12 patients or claim lines.',
  counties: sortedCounties,
};

await writeFile(outputPath, `${JSON.stringify(dataset)}\n`);
const unmatchedPaid = unmatched.reduce((sum, item) => sum + item.paid, 0);
process.stdout.write(
  `Wrote ${Object.keys(sortedCounties).length.toLocaleString()} counties; ` +
    `${unmatched.length.toLocaleString()} ZIPs with ${formatCurrency(unmatchedPaid)} were unmatched.\n`,
);
if (unmatched.length) {
  process.stdout.write(
    `${unmatched
      .sort((left, right) => right.paid - left.paid)
      .slice(0, 30)
      .map(({zip, providers, paid}) => `${zip}|${providers}|${paid}`)
      .join('\n')}\n`,
  );
}

function emptyCounty() {
  return {
    providers: 0,
    paid: 0,
    claimLines: 0,
    serviceCells: 0,
    adjustmentCells: 0,
  };
}

async function loadZipCounties(validGeoids) {
  const [nationalText, connecticutText] = await Promise.all([
    fetchText(
      'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt',
    ),
    fetchText(
      'https://www2.census.gov/geo/docs/maps-data/data/rel2022/acs22_cousub22_zcta520_st09.txt',
    ),
  ]);
  const national = largestAreaMatch(
    nationalText,
    'GEOID_ZCTA5_20',
    'GEOID_COUNTY_20',
    (geoid) => geoid,
    validGeoids,
  );
  const connecticut = largestAreaMatch(
    connecticutText,
    'GEOID_ZCTA5_20',
    'GEOID_COUSUB_22',
    (geoid) => geoid.slice(0, 5),
    validGeoids,
  );
  for (const [zip, geoid] of connecticut) national.set(zip, geoid);
  return national;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load Census ZIP relationship file (${response.status})`);
  }
  return response.text();
}

function largestAreaMatch(text, zipColumn, geoidColumn, normalizeGeoid, validGeoids) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines.shift().split('|');
  const zipIndex = header.indexOf(zipColumn);
  const geoidIndex = header.indexOf(geoidColumn);
  const landIndex = header.indexOf('AREALAND_PART');
  const waterIndex = header.indexOf('AREAWATER_PART');
  if ([zipIndex, geoidIndex, landIndex, waterIndex].includes(-1)) {
    throw new Error('Unexpected Census ZIP relationship file format');
  }
  const candidates = new Map();
  for (const line of lines) {
    const fields = line.split('|');
    const zip = fields[zipIndex];
    const geoid = normalizeGeoid(fields[geoidIndex]);
    if (!zip || !validGeoids.has(geoid)) continue;
    const area = Number(fields[landIndex]) + Number(fields[waterIndex]);
    const current = candidates.get(zip);
    if (!current || area > current.area) candidates.set(zip, {geoid, area});
  }
  return new Map([...candidates].map(([zip, {geoid}]) => [zip, geoid]));
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
