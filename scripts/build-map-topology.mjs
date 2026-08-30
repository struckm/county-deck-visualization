import {readFile, writeFile} from 'node:fs/promises';
import {topology} from 'topojson-server';

const [
  countiesPath = 'public/data/us-counties-2023.geojson',
  statesPath = 'public/data/us-states-2023.geojson',
  outputPath = 'public/data/us-counties-states-2023.topojson',
  quantizationArgument = '1000000',
] = process.argv.slice(2);

const quantization = Number.parseInt(quantizationArgument, 10);
if (!Number.isSafeInteger(quantization) || quantization < 2) {
  throw new Error(`Invalid quantization: ${quantizationArgument}`);
}

const [counties, states] = await Promise.all([
  readGeoJson(countiesPath),
  readGeoJson(statesPath),
]);
const mapTopology = topology({counties, states}, quantization);
const json = JSON.stringify(mapTopology);
await writeFile(outputPath, `${json}\n`);

console.log(
  `Wrote ${outputPath} (${mapTopology.arcs.length.toLocaleString('en-US')} shared arcs, ${Buffer.byteLength(json).toLocaleString('en-US')} bytes)`,
);

async function readGeoJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
