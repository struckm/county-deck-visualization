import {createLandAreaMetric} from './data/sampleMetric';
import {loadCounties} from './data/loadCounties';
import {CountyChoropleth} from './map/CountyChoropleth';
import {CountyDetailOverlay} from './map/CountyDetailOverlay';
import type {CountyFeature, CountyMetric} from './map/types';

export class CountyMapApp {
  private readonly abortController = new AbortController();
  private readonly mapCard: HTMLElement;
  private readonly status: HTMLDivElement;
  private readonly footer: HTMLElement;
  private choropleth: CountyChoropleth | null = null;
  private detailOverlay: CountyDetailOverlay | null = null;
  private metric: CountyMetric | null = null;

  constructor(private readonly root: HTMLDivElement) {
    root.innerHTML = `
      <main class="app-shell">
        <header class="app-header">
          <div>
            <div class="eyebrow">County atlas / Census 2023</div>
            <h1>Land area across U.S. counties</h1>
            <p>A reusable Deck.gl choropleth keyed by five-digit county GEOID.</p>
          </div>
          <div class="source-note">Census cartographic boundary, 1:5m</div>
        </header>
        <section class="map-card">
          <div class="map-status" role="status">
            <span class="spinner"></span> Loading county boundaries…
          </div>
        </section>
        <footer class="detail-bar" aria-live="polite"></footer>
      </main>`;
    this.mapCard = required(root, '.map-card', HTMLElement);
    this.status = required(root, '.map-status', HTMLDivElement);
    this.footer = required(root, '.detail-bar', HTMLElement);
    this.renderFooter(null);
  }

  async start() {
    try {
      const counties = await loadCounties(this.abortController.signal);
      if (this.abortController.signal.aborted) return;
      this.metric = createLandAreaMetric(counties);

      const map = document.createElement('div');
      map.className = 'map map--loading';
      map.setAttribute('aria-label', `${this.metric.label} by U.S. county`);
      this.mapCard.append(map);

      this.choropleth = new CountyChoropleth(
        map,
        counties,
        this.metric,
        (county) => this.selectCounty(county),
        () => this.status.remove(),
      );
      this.detailOverlay = new CountyDetailOverlay(
        this.mapCard,
        counties.features[0],
        this.metric,
        () => this.clearSelection(),
      );
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      this.status.classList.add('map-status--error');
      this.status.setAttribute('role', 'alert');
      this.status.replaceChildren(
        document.createTextNode(
          `Could not load county boundaries: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ),
      );
    }
  }

  destroy() {
    this.abortController.abort();
    this.choropleth?.destroy();
    this.detailOverlay?.destroy();
  }

  private selectCounty(county: CountyFeature) {
    this.detailOverlay?.open(county);
    this.renderFooter(county);
    this.choropleth?.setSelection(county.properties.GEOID);
  }

  private clearSelection() {
    this.choropleth?.setSelection(null);
    this.detailOverlay?.hide();
    this.renderFooter(null);
  }

  private renderFooter(county: CountyFeature | null) {
    if (!county || !this.metric) {
      const instruction = document.createElement('span');
      instruction.textContent =
        'Select a county for details. Scroll to zoom; drag to pan.';
      this.footer.replaceChildren(instruction);
      return;
    }

    const metricValue = this.metric.values.get(county.properties.GEOID);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => this.clearSelection());
    this.footer.replaceChildren(
      createDetail('Selected county', `${county.properties.NAMELSAD}, ${county.properties.STUSPS}`),
      createDetail('FIPS / GEOID', county.properties.GEOID),
      createDetail(
        this.metric.label,
        metricValue == null ? 'No data' : this.metric.formatValue(metricValue),
      ),
      clear,
    );
  }
}

function createDetail(label: string, value: string) {
  const group = document.createElement('div');
  const term = document.createElement('span');
  term.className = 'detail-bar__label';
  term.textContent = label;
  const detail = document.createElement('strong');
  detail.textContent = value;
  group.append(term, detail);
  return group;
}

function required<T extends Element>(
  parent: ParentNode,
  selector: string,
  constructor: {new (): T},
) {
  const element = parent.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}
