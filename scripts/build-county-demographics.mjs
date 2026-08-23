import {createReadStream} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/build-county-demographics.mjs <Census CSV> <output JSON>',
  );
}

const lines = createInterface({
  input: createReadStream(inputPath),
  crlfDelay: Infinity,
});
let column;
const counties = {};

for await (const line of lines) {
  const fields = line.split(',');
  if (!column) {
    column = Object.fromEntries(fields.map((header, index) => [header, index]));
    continue;
  }
  if (
    fields[column.SUMLEV] !== '050' ||
    fields[column.YEAR] !== '6' ||
    fields[column.AGEGRP] !== '0'
  ) {
    continue;
  }

  const value = (name) => Number(fields[column[name]]);
  const pair = (prefix) => value(`${prefix}_MALE`) + value(`${prefix}_FEMALE`);
  const geoid = `${fields[column.STATE]}${fields[column.COUNTY]}`;
  const total = value('TOT_POP');
  const raceEthnicity = {
    hispanic: pair('H'),
    whiteNonHispanic: pair('NHWA'),
    blackNonHispanic: pair('NHBA'),
    nativeNonHispanic: pair('NHIA'),
    asianNonHispanic: pair('NHAA'),
    pacificIslanderNonHispanic: pair('NHNA'),
    multiracialNonHispanic: pair('NHTOM'),
  };
  const categoryTotal = Object.values(raceEthnicity).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (categoryTotal !== total) {
    throw new Error(`${geoid}: demographic categories do not sum to total`);
  }
  counties[geoid] = {
    total,
    male: value('TOT_MALE'),
    female: value('TOT_FEMALE'),
    ...raceEthnicity,
  };
}

if (Object.keys(counties).length !== 3_144) {
  throw new Error(`Expected 3,144 county records, found ${Object.keys(counties).length}`);
}

const dataset = {
  vintage: '2024',
  label: 'Population by sex, race, and Hispanic origin',
  source: {
    label: 'U.S. Census Bureau Population Estimates Program',
    url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/asrh/cc-est2024-alldata.csv',
  },
  counties,
};

await writeFile(outputPath, `${JSON.stringify(dataset)}\n`);
