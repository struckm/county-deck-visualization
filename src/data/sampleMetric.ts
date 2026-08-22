import type {CountyFeatureCollection, CountyMetric} from '../map/types';

const squareMetersPerSquareMile = 2_589_988.110336;

export function createLandAreaMetric(
  counties: CountyFeatureCollection,
): CountyMetric {
  return {
    id: 'land-area',
    label: 'Land area',
    description: 'Census 2023 cartographic boundary land-area attribute',
    values: new Map(
      counties.features.map((feature) => [
        feature.properties.GEOID,
        feature.properties.ALAND / squareMetersPerSquareMile,
      ]),
    ),
    formatValue: (value) =>
      `${new Intl.NumberFormat('en-US', {maximumFractionDigits: 0}).format(value)} sq mi`,
  };
}
