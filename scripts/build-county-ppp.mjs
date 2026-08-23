import {readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const [countyGeoJsonPath, outputPath, database = 'ppp-data'] = process.argv.slice(2);
if (!countyGeoJsonPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/build-county-ppp.mjs <county GeoJSON> <output JSON> [database]',
  );
}

const countyGeoJson = JSON.parse(await readFile(countyGeoJsonPath, 'utf8'));
const countyAliases = createCountyAliases(countyGeoJson.features);
const validGeoids = new Set(
  countyGeoJson.features.map((feature) => feature.properties.GEOID),
);
const zipCounties = await loadZipCounties(validGeoids);
const query = String.raw`
select
  upper(trim("ProjectState")) as state,
  upper(trim("ProjectCountyName")) as county,
  left(regexp_replace(coalesce("ProjectZip", ''), '[^0-9]', '', 'g'), 5) as zip,
  count(*) as loans,
  coalesce(sum(nullif(trim("CurrentApprovalAmount"),'')::numeric), 0) as approved,
  coalesce(sum(nullif(trim("ForgivenessAmount"),'')::numeric), 0) as forgiven,
  coalesce(sum(nullif(trim("JobsReported"),'')::numeric), 0) as jobs,
  count(*) filter (where "Gender" = 'Male Owned') as male_owned,
  count(*) filter (where "Gender" = 'Female Owned') as female_owned,
  count(*) filter (where "Gender" not in ('Male Owned', 'Female Owned') or "Gender" is null) as gender_unanswered,
  count(*) filter (where "Ethnicity" = 'Hispanic or Latino') as hispanic,
  count(*) filter (where "Ethnicity" = 'Not Hispanic or Latino') as not_hispanic,
  count(*) filter (where "Ethnicity" not in ('Hispanic or Latino', 'Not Hispanic or Latino') or "Ethnicity" is null) as ethnicity_unanswered,
  count(*) filter (where "Race" = 'White') as white,
  count(*) filter (where "Race" = 'Black or African American') as black,
  count(*) filter (where "Race" in ('American Indian or Alaska Native', 'Eskimo & Aleut')) as native,
  count(*) filter (where "Race" = 'Asian') as asian,
  count(*) filter (where "Race" = 'Native Hawaiian or Other Pacific Islander') as pacific_islander,
  count(*) filter (where "Race" = 'Multi Group') as multiracial,
  count(*) filter (where "Race" = 'Puerto Rican') as other_race,
  count(*) filter (where "Race" = 'Unanswered' or "Race" is null) as race_unanswered
from public.ppp
where nullif(trim("ProjectState"),'') is not null
  and nullif(trim("ProjectCountyName"),'') is not null
group by 1, 2, 3
order by 1, 2, 3;
`;

const psql = spawnSync(
  '/opt/homebrew/opt/libpq/bin/psql',
  ['-h', 'localhost', '-p', '5432', '-d', database, '-A', '-F', '\t', '-t', '-c', query],
  {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
);
if (psql.status !== 0) {
  throw new Error(psql.stderr || `psql exited with status ${psql.status}`);
}

const counties = {};
const unmatched = [];
for (const line of psql.stdout.trim().split('\n')) {
  const fields = line.split('\t');
  const [state, countyName, zip] = fields;
  const nameGeoid = findCounty(countyAliases, state, countyName);
  const zipGeoid = zipCounties.get(zip);
  const geoid =
    state === 'CT'
      ? zipGeoid ?? nameGeoid
      : nameGeoid ?? zipGeoid;
  if (!geoid) {
    unmatched.push({state, countyName, zip, loans: Number(fields[3])});
    continue;
  }
  const values = fields.slice(3).map(Number);
  const county = (counties[geoid] ??= emptyCounty());
  county.loans += values[0];
  county.approved += values[1];
  county.forgiven += values[2];
  county.jobs += values[3];
  county.owners.male += values[4];
  county.owners.female += values[5];
  county.owners.genderUnanswered += values[6];
  county.owners.hispanic += values[7];
  county.owners.notHispanic += values[8];
  county.owners.ethnicityUnanswered += values[9];
  county.owners.white += values[10];
  county.owners.black += values[11];
  county.owners.native += values[12];
  county.owners.asian += values[13];
  county.owners.pacificIslander += values[14];
  county.owners.multiracial += values[15];
  county.owners.otherRace += values[16];
  county.owners.raceUnanswered += values[17];
}

for (const county of Object.values(counties)) {
  county.approved = roundMoney(county.approved);
  county.forgiven = roundMoney(county.forgiven);
  county.jobs = Math.round(county.jobs);
}

const sortedCounties = Object.fromEntries(
  Object.entries(counties).sort(([left], [right]) => left.localeCompare(right)),
);
const dataset = {
  id: 'ppp-approved-amount',
  label: 'PPP approved amount',
  description:
    'Current approval amount for SBA Paycheck Protection Program loans approved from April 3, 2020 through July 19, 2021',
  vintage: '2020–2021',
  source: {
    label: 'U.S. Small Business Administration PPP FOIA data',
    url: 'https://data.sba.gov/dataset/ppp-foia',
  },
  caveat:
    'Owner demographic fields are borrower-reported and frequently unanswered. Approved amount is not the same as forgiveness; forgiveness is shown separately. County attribution uses the project county, with Census ZIP relationships as a fallback.',
  counties: sortedCounties,
};

await writeFile(outputPath, `${JSON.stringify(dataset)}\n`);
const unmatchedLoans = unmatched.reduce((sum, item) => sum + item.loans, 0);
process.stdout.write(
  `Wrote ${Object.keys(sortedCounties).length.toLocaleString()} counties; ` +
    `${unmatchedLoans.toLocaleString()} loans across ${unmatched.length} county labels were unmatched.\n`,
);
if (unmatched.length) {
  process.stdout.write(
    `${unmatched
      .sort((left, right) => right.loans - left.loans)
      .slice(0, 30)
      .map(
        ({state, countyName, zip, loans}) =>
          `${state}|${countyName}|${zip}|${loans}`,
      )
      .join('\n')}\n`,
  );
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

function emptyCounty() {
  return {
    loans: 0,
    approved: 0,
    forgiven: 0,
    jobs: 0,
    owners: {
      male: 0,
      female: 0,
      genderUnanswered: 0,
      hispanic: 0,
      notHispanic: 0,
      ethnicityUnanswered: 0,
      white: 0,
      black: 0,
      native: 0,
      asian: 0,
      pacificIslander: 0,
      multiracial: 0,
      otherRace: 0,
      raceUnanswered: 0,
    },
  };
}

function createCountyAliases(features) {
  const candidates = new Map();
  for (const feature of features) {
    const state = feature.properties.STUSPS;
    for (const name of [feature.properties.NAME, feature.properties.NAMELSAD]) {
      for (const alias of nameAliases(name)) {
        const key = `${state}|${alias}`;
        const geoids = candidates.get(key) ?? new Set();
        geoids.add(feature.properties.GEOID);
        candidates.set(key, geoids);
      }
    }
  }
  return new Map(
    [...candidates]
      .filter(([, geoids]) => geoids.size === 1)
      .map(([key, geoids]) => [key, [...geoids][0]]),
  );
}

function findCounty(aliases, state, countyName) {
  for (const alias of nameAliases(countyName)) {
    const geoid = aliases.get(`${state}|${alias}`);
    if (geoid) return geoid;
  }
  return null;
}

function nameAliases(value) {
  const normalized = normalizeName(value);
  const aliases = new Set([normalized]);
  const suffixes = [
    'CITYANDBOROUGH',
    'CENSUSAREA',
    'MUNICIPALITY',
    'BOROUGH',
    'PARISH',
    'COUNTY',
  ];
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) aliases.add(normalized.slice(0, -suffix.length));
  }
  for (const alias of [...aliases]) {
    aliases.add(alias.replace(/^SAINT/, 'ST'));
    aliases.add(alias.replace(/^ST/, 'SAINT'));
  }
  return aliases;
}

function normalizeName(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
