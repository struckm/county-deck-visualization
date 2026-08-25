import {loadCounties} from './data/loadCounties';
import {loadCountyMetric} from './data/loadMetric';
import {
  createOlderPopulationMetric,
  loadCountyDemographics,
} from './data/loadDemographics';
import {createCrimeMetric, loadCountyCrime} from './data/loadCrime';
import {createPppMetric, loadCountyPpp} from './data/loadPpp';
import {
  createMedicaidMetric,
  createMedicaidPerOlderResidentMetric,
  loadCountyMedicaid,
} from './data/loadMedicaid';
import {createEthnicityOverlay} from './data/ethnicityOverlay';
import {createCrimeRaceOverlay} from './data/crimeRaceOverlay';
import {CountyChoropleth} from './map/CountyChoropleth';
import {CountyDetailOverlay} from './map/CountyDetailOverlay';
import type {
  CountyCategoryOverlay,
  CountyFeature,
  CountyMetric,
} from './map/types';

export class CountyMapApp {
  private readonly abortController = new AbortController();
  private readonly mapCard: HTMLElement;
  private readonly status: HTMLDivElement;
  private readonly footer: HTMLElement;
  private readonly heading: HTMLHeadingElement;
  private readonly description: HTMLParagraphElement;
  private readonly metricSelect: HTMLSelectElement;
  private readonly sourceNote: HTMLAnchorElement;
  private choropleth: CountyChoropleth | null = null;
  private detailOverlay: CountyDetailOverlay | null = null;
  private mapElement: HTMLDivElement | null = null;
  private metric: CountyMetric | null = null;
  private metrics: CountyMetric[] = [];
  private categoryOverlays: CountyCategoryOverlay[] = [];
  private selectedCounty: CountyFeature | null = null;

  constructor(private readonly root: HTMLDivElement) {
    root.innerHTML = `
      <main class="app-shell">
        <header class="app-header">
          <div>
            <div class="eyebrow">County atlas / Census 2023</div>
            <h1>Population across U.S. counties</h1>
            <p class="metric-description">Estimated resident population on July 1, 2024</p>
          </div>
          <div class="metric-control">
            <div class="metric-control__field">
              <label for="metric-select">Metric</label>
              <select id="metric-select" disabled>
                <option>Loading metrics…</option>
              </select>
            </div>
            <a class="source-note" target="_blank" rel="noreferrer"></a>
          </div>
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
    this.heading = required(root, 'h1', HTMLHeadingElement);
    this.description = required(
      root,
      '.metric-description',
      HTMLParagraphElement,
    );
    this.metricSelect = required(
      root,
      '#metric-select',
      HTMLSelectElement,
    );
    this.sourceNote = required(
      root,
      '.source-note',
      HTMLAnchorElement,
    );
    this.metricSelect.addEventListener('change', () => {
      const overlay = this.categoryOverlays.find(
        (candidate) => candidate.id === this.metricSelect.value,
      );
      if (overlay) {
        this.applyCategoryOverlay(overlay);
        return;
      }
      const metric = this.metrics.find(
        (candidate) => candidate.id === this.metricSelect.value,
      );
      if (metric) this.applyMetric(metric);
    });
    this.renderFooter(null);
  }

  async start() {
    try {
      const [counties, population, demographics, crime, ppp, medicaid] =
        await Promise.all([
          loadCounties(this.abortController.signal),
          loadCountyMetric(
            '/data/county-population-2024.json',
            (value) => new Intl.NumberFormat('en-US').format(value),
            this.abortController.signal,
          ),
          loadCountyDemographics(this.abortController.signal),
          loadCountyCrime(this.abortController.signal),
          loadCountyPpp(this.abortController.signal),
          loadCountyMedicaid(this.abortController.signal),
        ]);
      if (this.abortController.signal.aborted) return;
      this.metrics = [
        population,
        createOlderPopulationMetric(demographics),
        createMedicaidPerOlderResidentMetric(medicaid, demographics),
        createMedicaidMetric(medicaid),
        createPppMetric(ppp),
        createCrimeMetric(crime),
      ];
      this.categoryOverlays = [
        createEthnicityOverlay(demographics),
        createCrimeRaceOverlay(crime),
      ];
      this.populateMetricSelect();
      const initialMetric = this.metrics[0];
      this.applyMetric(initialMetric);

      const map = document.createElement('div');
      map.className = 'map map--loading';
      map.setAttribute('aria-label', `${initialMetric.label} by U.S. county`);
      this.mapCard.append(map);
      this.mapElement = map;

      this.choropleth = new CountyChoropleth(
        map,
        counties,
        initialMetric,
        (county) => this.selectCounty(county),
        () => this.status.remove(),
      );
      this.detailOverlay = new CountyDetailOverlay(
        this.mapCard,
        counties.features[0],
        initialMetric,
        demographics,
        crime,
        ppp,
        medicaid,
        () => this.clearSelection(),
      );
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      this.status.classList.add('map-status--error');
      this.status.setAttribute('role', 'alert');
      this.status.replaceChildren(
        document.createTextNode(
          `Could not load map data: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    this.selectedCounty = county;
    this.detailOverlay?.open(county);
    this.renderFooter(county);
    this.choropleth?.setSelection(county.properties.GEOID);
  }

  private clearSelection() {
    this.selectedCounty = null;
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

  private populateMetricSelect() {
    this.metricSelect.replaceChildren(
      ...this.metrics.map((metric) => {
        const option = document.createElement('option');
        option.value = metric.id;
        option.textContent = metric.vintage
          ? `${metric.label} (${metric.vintage})`
          : metric.label;
        return option;
      }),
      ...this.categoryOverlays.map((overlay) =>
        createOption(
          overlay.id,
          overlay.vintage
            ? `${overlay.label} (${overlay.vintage})`
            : overlay.label,
        ),
      ),
    );
    this.metricSelect.disabled = false;
  }

  private applyMetric(metric: CountyMetric) {
    this.metric = metric;
    this.metricSelect.value = metric.id;
    this.choropleth?.setCategoryOverlay(null);
    this.choropleth?.setMetric(metric);
    this.detailOverlay?.setMetric(metric);
    this.renderFooter(this.selectedCounty);
    this.heading.textContent = `${metric.label} across U.S. counties`;
    this.description.textContent =
      metric.description ?? 'County-level data keyed by five-digit Census GEOID.';
    this.sourceNote.textContent = metric.source?.label ?? '';
    this.sourceNote.href = metric.source?.url ?? '#';
    this.sourceNote.hidden = !metric.source;
    this.mapElement?.setAttribute(
      'aria-label',
      `${metric.label} by U.S. county`,
    );
  }

  private applyCategoryOverlay(overlay: CountyCategoryOverlay) {
    const detailMetric = this.metrics.find(({id}) => id === overlay.metricId);
    if (!detailMetric) return;
    this.metric = detailMetric;
    this.metricSelect.value = overlay.id;
    this.choropleth?.setMetric(detailMetric);
    this.choropleth?.setCategoryOverlay(overlay);
    this.detailOverlay?.setMetric(detailMetric);
    this.renderFooter(this.selectedCounty);
    this.heading.textContent = `${overlay.label} by county`;
    this.description.textContent = overlay.description;
    this.sourceNote.textContent = overlay.source?.label ?? '';
    this.sourceNote.href = overlay.source?.url ?? '#';
    this.sourceNote.hidden = !overlay.source;
    this.mapElement?.setAttribute('aria-label', `${overlay.label} by county`);
  }
}

function createOption(value: string, label: string) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
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
