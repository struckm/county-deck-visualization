import type {Feature, FeatureCollection, MultiPolygon, Polygon} from 'geojson';

export type CountyProperties = {
  GEOID: string;
  NAME: string;
  NAMELSAD: string;
  STUSPS: string;
  STATE_NAME: string;
  ALAND: number;
  AWATER: number;
};

export type CountyFeature = Feature<Polygon | MultiPolygon, CountyProperties>;
export type CountyFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  CountyProperties
>;

export type Color = [number, number, number, number];

export type CountyMetric = {
  id: string;
  label: string;
  description?: string;
  vintage?: string;
  source?: {
    label: string;
    url: string;
  };
  scale?: 'quantile' | 'log';
  values: ReadonlyMap<string, number | null>;
  formatValue: (value: number) => string;
};

export type CountyMetricFile = Omit<CountyMetric, 'values' | 'formatValue'> & {
  values: Record<string, number | null>;
};

export type CountyCategory = {
  id: string;
  label: string;
  color: Color;
  countyCount: number;
};

export type CountyCategoryOverlay = {
  id: string;
  metricId: string;
  label: string;
  description: string;
  vintage?: string;
  source?: {
    label: string;
    url: string;
  };
  categories: readonly CountyCategory[];
  values: ReadonlyMap<string, string>;
};
