import {readFile, writeFile} from 'node:fs/promises';

const [countyGeoJsonPath, jsonOutputPath, csvOutputPath, yearArg = '2024'] =
  process.argv.slice(2);
if (!countyGeoJsonPath || !jsonOutputPath || !csvOutputPath) {
  throw new Error(
    'Usage: node scripts/build-county-medicaid-enrollment.mjs <county GeoJSON> <output JSON> <output CSV> [year]',
  );
}

const year = Number(yearArg);
if (!Number.isInteger(year)) throw new Error(`Invalid year: ${yearArg}`);

const countyGeoJson = JSON.parse(await readFile(countyGeoJsonPath, 'utf8'));
const countyNames = new Map(
  countyGeoJson.features.map(({properties}) => [
    properties.GEOID,
    {
      name: `${properties.NAMELSAD}, ${properties.STATE_NAME}`,
      stateAbbreviation: properties.STUSPS,
    },
  ]),
);

const endpoint =
  `https://www2.census.gov/programs-surveys/acs/summary_file/${year}/` +
  `table-based-SF/data/5YRData/acsdt5y${year}-c27007.dat`;

const response = await fetch(endpoint);
if (!response.ok) {
  throw new Error(`Census summary file request failed (${response.status})`);
}

const [headerLine, ...lines] = (await response.text()).trim().split(/\r?\n/);
const header = headerLine.split('|');
const column = Object.fromEntries(header.map((name, index) => [name, index]));
const counties = {};

for (const line of lines) {
  const row = line.split('|');
  const match = /^0500000US(\d{5})$/.exec(row[column.GEO_ID]);
  if (!match) continue;
  const geoid = match[1];
  const geography = countyNames.get(geoid);
  if (!geography) continue;
  const stateFips = geoid.slice(0, 2);
  const countyFips = geoid.slice(2);
  const population = value(row, column, 'C27007_E001', geography.name);
  const populationMoe = value(row, column, 'C27007_M001', geography.name);

  const child = sum(row, column, ['C27007_E004', 'C27007_E014'], geography.name);
  const childMoe = combinedMoe(
    row,
    column,
    ['C27007_M004', 'C27007_M014'],
    geography.name,
  );
  const adult = sum(row, column, ['C27007_E007', 'C27007_E017'], geography.name);
  const adultMoe = combinedMoe(
    row,
    column,
    ['C27007_M007', 'C27007_M017'],
    geography.name,
  );
  const olderAdult = sum(
    row,
    column,
    ['C27007_E010', 'C27007_E020'],
    geography.name,
  );
  const olderAdultMoe = combinedMoe(
    row,
    column,
    ['C27007_M010', 'C27007_M020'],
    geography.name,
  );
  const enrolled = child + adult + olderAdult;
  const enrolledMoe = rootSumSquares([childMoe, adultMoe, olderAdultMoe]);

  counties[geoid] = {
    name: geography.name,
    stateAbbreviation: geography.stateAbbreviation,
    stateFips,
    countyFips,
    population,
    populationMoe,
    enrolled,
    enrolledMoe,
    enrollmentPercent: population === 0 ? null : round((enrolled / population) * 100, 2),
    under19: child,
    under19Moe: childMoe,
    age19To64: adult,
    age19To64Moe: adultMoe,
    age65Plus: olderAdult,
    age65PlusMoe: olderAdultMoe,
  };
}

const sortedCounties = Object.fromEntries(
  Object.entries(counties).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  ),
);
const dataset = {
  id: 'medicaid-enrollment-estimate',
  label: 'Estimated Medicaid enrollment',
  description:
    'People with Medicaid or other means-tested public health coverage by county',
  vintage: String(year),
  period: `${year - 4}-${year}`,
  survey: 'American Community Survey 5-Year Estimates',
  table: 'C27007',
  universe: 'Civilian noninstitutionalized population',
  source: {
    label: `U.S. Census Bureau, ${year} ACS 5-Year Estimates, table C27007`,
    url: endpoint,
  },
  caveat:
    `The ${year} ACS 5-year estimates pool survey responses from ${year - 4} through ${year}; ` +
    'they are not administrative Medicaid caseload counts or a point-in-time count. ' +
    'The measure includes Medicaid and other means-tested public coverage. ' +
    'Margins of error use the ACS 90% confidence level.',
  counties: sortedCounties,
};

const csvColumns = [
  'geoid',
  'name',
  'stateAbbreviation',
  'stateFips',
  'countyFips',
  'population',
  'populationMoe',
  'enrolled',
  'enrolledMoe',
  'enrollmentPercent',
  'under19',
  'under19Moe',
  'age19To64',
  'age19To64Moe',
  'age65Plus',
  'age65PlusMoe',
];
const csvRows = [csvColumns.join(',')];
for (const [geoid, county] of Object.entries(sortedCounties)) {
  const record = {geoid, ...county};
  csvRows.push(csvColumns.map((key) => csvCell(record[key])).join(','));
}

await Promise.all([
  writeFile(jsonOutputPath, `${JSON.stringify(dataset)}\n`),
  writeFile(csvOutputPath, `${csvRows.join('\n')}\n`),
]);

const nationalEnrollment = Object.values(sortedCounties).reduce(
  (total, county) => total + county.enrolled,
  0,
);
process.stdout.write(
  `Wrote ${Object.keys(sortedCounties).length.toLocaleString()} county records; ` +
    `${nationalEnrollment.toLocaleString()} estimated enrollees.\n`,
);

function value(row, column, variable, geographyName) {
  const result = Number(row[column[variable]]);
  if (!Number.isFinite(result) || result < 0) {
    throw new Error(`Invalid ${variable} value for ${geographyName}`);
  }
  return result;
}

function sum(row, column, variableNames, geographyName) {
  return variableNames.reduce(
    (total, variable) => total + value(row, column, variable, geographyName),
    0,
  );
}

function combinedMoe(row, column, variableNames, geographyName) {
  return rootSumSquares(
    variableNames.map((variable) => value(row, column, variable, geographyName)),
  );
}

function rootSumSquares(values) {
  return Math.round(Math.sqrt(values.reduce((total, item) => total + item ** 2, 0)));
}

function round(number, digits) {
  const factor = 10 ** digits;
  return Math.round((number + Number.EPSILON) * factor) / factor;
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
