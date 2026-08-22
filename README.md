# U.S. county Deck.gl foundation

A small, reusable React + Deck.gl county choropleth using the 2023 Census
1:5,000,000 cartographic boundary file. The example metric is county land area.

## Run locally

```bash
npm install
npm run dev
```

## Reuse with another metric

`CountyChoropleth` receives geometry and metric data separately. Create a
`CountyMetric` whose `values` map is keyed by the Census five-digit county
`GEOID`, then pass it to the component:

```tsx
const metric = {
  id: 'example',
  label: 'Example metric',
  values: new Map([
    ['17031', 42],
    ['06037', 81],
  ]),
  formatValue: (value: number) => value.toFixed(1),
};

<CountyChoropleth counties={counties} metric={metric} />;
```

The component owns rendering, hover, selection highlighting, and the legend;
the application owns loading, metric construction, and selected-county state.

## Data

`public/data/us-counties-2023.geojson` is derived from the included Census
shapefile and retains only the fields used by the visualization. The source
uses NAD83; the browser-ready file is explicitly written as EPSG:4326.
