# U.S. county Deck.gl foundation

A small, reusable TypeScript + Deck.gl county choropleth using the 2023 Census
1:5,000,000 cartographic boundary file. The example metric is county land area.
The application uses direct DOM updates and persistent `Deck` instances; it has
no UI framework or component runtime.

Click a county to open a focused detail overlay. The overlay fits the selected
geometry into its own independently interactive Deck.gl view and exposes the
county metric, water area, GEOID, and state. Close it with the × button, the
Escape key, or a click outside the panel.

## Run locally

```bash
npm install
npm run dev
```

## Reuse with another metric

`CountyChoropleth` receives geometry and metric data separately. Create a
`CountyMetric` whose `values` map is keyed by the Census five-digit county
`GEOID`, then pass it to the map:

```ts
const metric = {
  id: 'example',
  label: 'Example metric',
  values: new Map([
    ['17031', 42],
    ['06037', 81],
  ]),
  formatValue: (value: number) => value.toFixed(1),
};

const map = new CountyChoropleth(
  container,
  counties,
  metric,
  (county) => showCountyDetail(county),
);
```

The long-lived choropleth object owns rendering, hover, selection highlighting,
and the legend; the application owns loading, metric construction, and
selected-county state through direct method calls.
`CountyDetailOverlay` is a separate detail surface, so county-specific layers
such as Census tracts or local facilities can be added without coupling them to
the national layer. Its Deck.gl renderer is measured and warmed while hidden,
then reused across selections so the blurred detail surface opens promptly.

## Data

`public/data/us-counties-2023.geojson` is derived from the included Census
shapefile and retains only the fields used by the visualization. The source
uses NAD83; the browser-ready file is explicitly written as EPSG:4326.
