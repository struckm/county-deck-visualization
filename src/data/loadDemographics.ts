export type CountyDemographics = {
  total: number;
  male: number;
  female: number;
  hispanic: number;
  whiteNonHispanic: number;
  blackNonHispanic: number;
  nativeNonHispanic: number;
  asianNonHispanic: number;
  pacificIslanderNonHispanic: number;
  multiracialNonHispanic: number;
};

export type CountyDemographicsDataset = {
  vintage: string;
  label: string;
  source: {
    label: string;
    url: string;
  };
  counties: ReadonlyMap<string, CountyDemographics>;
};

type CountyDemographicsFile = Omit<CountyDemographicsDataset, 'counties'> & {
  counties: Record<string, CountyDemographics>;
};

export async function loadCountyDemographics(
  signal?: AbortSignal,
): Promise<CountyDemographicsDataset> {
  const response = await fetch('/data/county-demographics-2024.json', {signal});
  if (!response.ok) {
    throw new Error(`Could not load county demographics (${response.status})`);
  }
  const file = (await response.json()) as CountyDemographicsFile;
  return {...file, counties: new Map(Object.entries(file.counties))};
}
