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
  values: ReadonlyMap<string, number | null>;
  formatValue: (value: number) => string;
};
