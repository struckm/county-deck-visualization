import {useMemo, useState} from 'react';
import {createLandAreaMetric} from './data/sampleMetric';
import {useCounties} from './data/useCounties';
import {CountyChoropleth} from './map/CountyChoropleth';
import type {CountyFeature} from './map/types';

export function App() {
  const counties = useCounties();
  const [selected, setSelected] = useState<CountyFeature | null>(null);
  const metric = useMemo(
    () =>
      counties.status === 'ready' ? createLandAreaMetric(counties.data) : null,
    [counties],
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">County atlas / Census 2023</div>
          <h1>Land area across U.S. counties</h1>
          <p>
            A reusable Deck.gl choropleth keyed by five-digit county GEOID.
          </p>
        </div>
        <div className="source-note">Census cartographic boundary, 1:5m</div>
      </header>

      <section className="map-card">
        {counties.status === 'loading' && (
          <div className="map-status" role="status">
            <span className="spinner" /> Loading county boundaries…
          </div>
        )}
        {counties.status === 'error' && (
          <div className="map-status map-status--error" role="alert">
            Could not load county boundaries: {counties.message}
          </div>
        )}
        {counties.status === 'ready' && metric && (
          <CountyChoropleth
            className="map"
            counties={counties.data}
            metric={metric}
            selectedGeoid={selected?.properties.GEOID}
            onSelect={setSelected}
          />
        )}
      </section>

      <footer className="detail-bar" aria-live="polite">
        {selected && metric ? (
          <>
            <div>
              <span className="detail-bar__label">Selected county</span>
              <strong>
                {selected.properties.NAMELSAD}, {selected.properties.STUSPS}
              </strong>
            </div>
            <div>
              <span className="detail-bar__label">FIPS / GEOID</span>
              <strong>{selected.properties.GEOID}</strong>
            </div>
            <div>
              <span className="detail-bar__label">{metric.label}</span>
              <strong>
                {metric.formatValue(metric.values.get(selected.properties.GEOID) ?? 0)}
              </strong>
            </div>
            <button type="button" onClick={() => setSelected(null)}>
              Clear
            </button>
          </>
        ) : (
          <span>Select a county for details. Scroll to zoom; drag to pan.</span>
        )}
      </footer>
    </main>
  );
}
