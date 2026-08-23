import {mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import {basename, join} from 'node:path';
import {createInterface} from 'node:readline';
import {spawn} from 'node:child_process';

const [linksPath, countyGeoJsonPath, outputPath, cachePath] = process.argv.slice(2);
if (!linksPath || !countyGeoJsonPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/build-county-crime.mjs <state links JSON> <county GeoJSON> <output JSON> [zip cache]',
  );
}

const YEAR = '2025';
const cacheDir = cachePath ?? join('/tmp', 'nibrs-2025-cache');
const stateLinks = JSON.parse(await readFile(linksPath, 'utf8'));
const countyGeoJson = JSON.parse(await readFile(countyGeoJsonPath, 'utf8'));
const countiesByState = Map.groupBy(
  countyGeoJson.features,
  (feature) => feature.properties.STUSPS,
);
const results = {};

await mkdir(cacheDir, {recursive: true});

const packages = Object.entries(stateLinks).map(([stateName, url]) => {
  const stateAbbr = stateAbbreviation(stateName);
  return {
    stateName,
    stateAbbr,
    url,
    zipPath: join(cacheDir, `${stateAbbr}-${YEAR}.zip`),
  };
});
await downloadPackages(packages, 4);

for (const {stateAbbr, zipPath} of packages) {
  process.stdout.write(`Processing ${stateAbbr}...\n`);
  const stateCounties = countiesByState.get(stateAbbr) ?? [];
  const agencyCounties = await loadAgencyCounties(stateAbbr, stateCounties);
  const agencyIds = new Map();
  await readZipLines(zipPath, 'agencies.csv', (line, index) => {
    if (index === 0) return;
    const fields = line.split(',', 4);
    const agencyId = fields[1];
    const ori = fields[3];
    const geoid = agencyCounties.get(ori);
    if (agencyId && geoid) agencyIds.set(agencyId, geoid);
  });

  const incidentCounties = new Map();
  await readZipLines(zipPath, 'NIBRS_incident.csv', (line, index) => {
    if (index === 0) return;
    const fields = line.split(',', 4);
    const geoid = agencyIds.get(fields[1]);
    if (!geoid) return;
    incidentCounties.set(fields[2], geoid);
    countyResult(geoid).incidents += 1;
  });

  await readZipLines(zipPath, 'NIBRS_OFFENSE.csv', (line, index) => {
    if (index === 0) return;
    const fields = line.split(',', 4);
    const geoid = incidentCounties.get(fields[2]);
    if (geoid) countyResult(geoid).offenses += 1;
  });

  await readZipLines(zipPath, 'NIBRS_OFFENDER.csv', (line, index) => {
    if (index === 0) return;
    const fields = line.split(',');
    const geoid = incidentCounties.get(fields[2]);
    if (!geoid) return;
    const offender = countyResult(geoid).offenders;
    offender.total += 1;
    incrementSex(offender, fields[6]);
    incrementRace(offender, fields[7]);
    incrementEthnicity(offender, fields[8]);
  });
}

async function downloadPackages(packageList, concurrency) {
  let nextIndex = 0;
  await Promise.all(
    Array.from({length: concurrency}, async () => {
      while (nextIndex < packageList.length) {
        const item = packageList[nextIndex++];
        if (await fileExists(item.zipPath)) continue;
        const partialPath = `${item.zipPath}.part`;
        process.stdout.write(`Downloading ${item.stateAbbr}...\n`);
        await run('curl', [
          '-L',
          '--fail',
          '--retry',
          '3',
          '--silent',
          '--show-error',
          '-o',
          partialPath,
          item.url,
        ]);
        await rename(partialPath, item.zipPath);
      }
    }),
  );
}

const sortedCounties = Object.fromEntries(
  Object.entries(results).sort(([left], [right]) => left.localeCompare(right)),
);
const dataset = {
  id: 'crime-offenses-2025',
  label: 'Reported offenses',
  description:
    'FBI NIBRS Group A offenses reported by participating law-enforcement agencies in 2025; reports are attributed to each agency’s mapped county.',
  vintage: YEAR,
  source: {
    label: 'FBI Crime Data Explorer — NIBRS',
    url: 'https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads',
  },
  caveat:
    'NIBRS reflects voluntarily reported offenses, not every crime committed. Known-offender demographics exclude no records but include unknown and not-specified values. Multi-county agencies are attributed using the agency location published by the FBI.',
  counties: sortedCounties,
};

await writeFile(outputPath, `${JSON.stringify(dataset)}\n`);
process.stdout.write(
  `Wrote ${Object.keys(sortedCounties).length.toLocaleString()} counties to ${basename(outputPath)}.\n`,
);

function countyResult(geoid) {
  results[geoid] ??= {
    offenses: 0,
    incidents: 0,
    offenders: {
      total: 0,
      male: 0,
      female: 0,
      sexUnknown: 0,
      hispanic: 0,
      notHispanic: 0,
      ethnicityMultiple: 0,
      ethnicityUnknown: 0,
      white: 0,
      black: 0,
      native: 0,
      asian: 0,
      pacificIslander: 0,
      multiracial: 0,
      raceUnknown: 0,
    },
  };
  return results[geoid];
}

function incrementSex(offender, code) {
  if (code === 'M') offender.male += 1;
  else if (code === 'F') offender.female += 1;
  else offender.sexUnknown += 1;
}

function incrementRace(offender, id) {
  const field = {
    10: 'white',
    20: 'black',
    30: 'native',
    40: 'asian',
    50: 'pacificIslander',
    70: 'multiracial',
  }[id];
  offender[field ?? 'raceUnknown'] += 1;
}

function incrementEthnicity(offender, id) {
  const field = {
    10: 'hispanic',
    20: 'notHispanic',
    30: 'ethnicityMultiple',
  }[id];
  offender[field ?? 'ethnicityUnknown'] += 1;
}

async function loadAgencyCounties(stateAbbr, countyFeatures) {
  const response = await fetch(
    `https://cde.ucr.cjis.gov/LATEST/agency/byStateAbbr/${stateAbbr}`,
  );
  if (!response.ok) {
    throw new Error(`Could not load ${stateAbbr} agency metadata (${response.status})`);
  }
  const groups = await response.json();
  const countiesByName = new Map(
    countyFeatures.map((feature) => [normalizeName(feature.properties.NAME), feature]),
  );
  const agencyCounties = new Map();

  for (const [countyNames, agencies] of Object.entries(groups)) {
    if (normalizeName(countyNames).includes('NOTSPECIFIED')) continue;
    const namedCounties = countyNames
      .split(',')
      .map((name) => countiesByName.get(normalizeName(name)))
      .filter(Boolean);
    for (const agency of agencies) {
      let county = null;
      if (Number.isFinite(agency.longitude) && Number.isFinite(agency.latitude)) {
        county = countyFeatures.find((feature) =>
          containsPoint(feature.geometry, [agency.longitude, agency.latitude]),
        );
      }
      county ??= namedCounties.length === 1 ? namedCounties[0] : null;
      if (county) agencyCounties.set(agency.ori, county.properties.GEOID);
    }
  }
  return agencyCounties;
}

function containsPoint(geometry, point) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    (polygon) =>
      pointInRing(point, polygon[0]) &&
      !polygon.slice(1).some((hole) => pointInRing(point, hole)),
  );
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function normalizeName(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function readZipLines(zipPath, entryName, onLine) {
  const child = spawn('unzip', ['-p', zipPath, entryName], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let error = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    error += chunk;
  });
  const lines = createInterface({input: child.stdout, crlfDelay: Infinity});
  let index = 0;
  for await (const line of lines) onLine(line, index++);
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) throw new Error(`Could not read ${entryName}: ${error.trim()}`);
}

async function run(command, args) {
  const child = spawn(command, args, {stdio: 'inherit'});
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) throw new Error(`${command} exited with status ${code}`);
}

async function fileExists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function stateAbbreviation(name) {
  const abbreviation = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
    Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC',
    Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN',
    Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
    Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
    Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
    Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
    'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
    Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
    Wyoming: 'WY',
  }[name];
  if (!abbreviation) throw new Error(`Unknown state: ${name}`);
  return abbreviation;
}
