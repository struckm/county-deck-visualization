import {readFile, writeFile} from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/build-population-metric.mjs <Census CSV> <output JSON>',
  );
}

const rows = (await readFile(inputPath, 'utf8')).trim().split(/\r?\n/);
const headers = rows.shift().split(',');
const column = Object.fromEntries(headers.map((header, index) => [header, index]));
const values = {};

for (const row of rows) {
  const fields = row.split(',');
  if (fields[column.SUMLEV] !== '050') continue;
  const geoid = `${fields[column.STATE]}${fields[column.COUNTY]}`;
  values[geoid] = Number(fields[column.POPESTIMATE2024]);
}

if (Object.keys(values).length !== 3_144) {
  throw new Error(`Expected 3,144 county records, found ${Object.keys(values).length}`);
}

const metric = {
  id: 'population-2024',
  label: 'Population',
  description: 'Estimated resident population on July 1, 2024',
  vintage: '2024',
  scale: 'log',
  source: {
    label: 'U.S. Census Bureau Population Estimates Program',
    url: 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv',
  },
  values,
};

await writeFile(outputPath, `${JSON.stringify(metric)}\n`);
