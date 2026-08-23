import type {CountyFeature} from './types';

export type GeoBounds = [
  [west: number, south: number],
  [east: number, north: number],
];

export function getCountyBounds(county: CountyFeature): GeoBounds {
  const positions: [number, number][] = [];
  collectPositions(county.geometry.coordinates, positions);

  if (!positions.length) return [[-180, -90], [180, 90]];

  const latitudes = positions.map(([, latitude]) => latitude);
  const longitudes = positions
    .map(([longitude]) => ((longitude % 360) + 360) % 360)
    .sort((a, b) => a - b);

  let largestGap = -1;
  let gapIndex = 0;
  for (let index = 0; index < longitudes.length; index += 1) {
    const current = longitudes[index];
    const next =
      index === longitudes.length - 1
        ? longitudes[0] + 360
        : longitudes[index + 1];
    if (next - current > largestGap) {
      largestGap = next - current;
      gapIndex = index;
    }
  }

  const west = longitudes[(gapIndex + 1) % longitudes.length];
  let east = longitudes[gapIndex];
  if (east < west) east += 360;
  const normalizedWest = west > 180 ? west - 360 : west;
  const normalizedEast = normalizedWest + (east - west);

  return [
    [normalizedWest, Math.min(...latitudes)],
    [normalizedEast, Math.max(...latitudes)],
  ];
}

function collectPositions(value: unknown, output: [number, number][]) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    output.push([value[0], value[1]]);
    return;
  }
  value.forEach((child) => collectPositions(child, output));
}
