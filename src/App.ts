import {loadCounties, loadStates} from './data/loadCounties';
import {loadCountyMetric} from './data/loadMetric';
import {loadCountyDemographics} from './data/loadDemographics';
import {createCrimeMetric, loadCountyCrime} from './data/loadCrime';
import {createPppMetric, loadCountyPpp} from './data/loadPpp';
import {createH1bMetric, loadCountyH1b} from './data/loadH1b';
import {
  createMedicaidMetric,
  createMedicaidPerEnrolleeMetric,
  loadCountyMedicaid,
} from './data/loadMedicaid';
import {
  createMedicaidEnrollmentMetric,
  createMedicaidEnrollmentPercentMetric,
  loadCountyMedicaidEnrollment,
} from './data/loadMedicaidEnrollment';
import {createEthnicityOverlay} from './data/ethnicityOverlay';
import {createCrimeRaceOverlay} from './data/crimeRaceOverlay';
import {CountyChoropleth} from './map/CountyChoropleth';
import {CountyDetailOverlay} from './map/CountyDetailOverlay';
import {
  trackGoogleAnalyticsEvent,
  trackGoogleAnalyticsPageView,
} from './analytics';
import {createMetricUrl, readMetricId} from './urlState';
import type {
  CountyCategoryOverlay,
  CountyFeature,
  CountyFeatureCollection,
  CountyMetric,
} from './map/types';

type InitialSelection = {
  metric: CountyMetric;
  overlay?: CountyCategoryOverlay;
  selectionId: string;
};

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
  private backgroundLoadTimer = 0;
  private backgroundLoadStarted = false;
  private populationPromise: Promise<CountyMetric> | null = null;
  private demographicsPromise: ReturnType<typeof loadCountyDemographics> | null =
    null;
  private crimePromise: ReturnType<typeof loadCountyCrime> | null = null;
  private pppPromise: ReturnType<typeof loadCountyPpp> | null = null;
  private h1bPromise: ReturnType<typeof loadCountyH1b> | null = null;
  private medicaidPromise: ReturnType<typeof loadCountyMedicaid> | null = null;
  private medicaidEnrollmentPromise: ReturnType<
    typeof loadCountyMedicaidEnrollment
  > | null = null;

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
        <footer class="site-footer">
          <div class="detail-bar" aria-live="polite"></div>
          <nav class="contact-links" aria-label="Contact Mark Struck">
            <a href="https://x.com/mark_struck" target="_blank" rel="noreferrer" title="Mark Struck on X" data-contact-method="x">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>
              </svg>
              <span class="visually-hidden">Mark Struck on X</span>
            </a>
            <a href="mailto:markstruck@comcast.net" target="_blank" rel="noreferrer" title="Email Mark Struck" data-contact-method="email">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/>
              </svg>
              <span class="visually-hidden">Email Mark Struck</span>
            </a>
            <a href="https://github.com/struckm" target="_blank" rel="noreferrer" title="Mark Struck on GitHub" data-contact-method="github">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
              </svg>
              <span class="visually-hidden">Mark Struck on GitHub</span>
            </a>
          </nav>
        </footer>
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
      const metricId = this.metricSelect.value;
      if (this.applySelection(metricId)) {
        this.pushMetricUrl(metricId);
        trackGoogleAnalyticsEvent('metric_select', {
          metric_id: metricId,
          metric_label:
            this.metricSelect.selectedOptions[0]?.textContent?.trim() ?? metricId,
        });
      }
    });
    required(root, '.contact-links', HTMLElement).addEventListener(
      'click',
      (event) => {
        if (!(event.target instanceof Element)) return;
        const contactMethod = event.target
          .closest<HTMLAnchorElement>('a[data-contact-method]')
          ?.dataset.contactMethod;
        if (contactMethod) {
          trackGoogleAnalyticsEvent('contact_click', {
            contact_method: contactMethod,
          });
        }
      },
      {signal: this.abortController.signal},
    );
    window.addEventListener(
      'popstate',
      () => this.applySelectionFromUrl(),
      {signal: this.abortController.signal},
    );
    this.renderFooter(null);
  }

  async start() {
    try {
      const requestedMetricId = readMetricId(window.location.href);
      const [counties, states, initialSelection] = await Promise.all([
        loadCounties(this.abortController.signal),
        loadStates(this.abortController.signal),
        this.loadInitialSelection(requestedMetricId),
      ]);
      if (this.abortController.signal.aborted) return;
      this.metrics = [initialSelection.metric];
      this.categoryOverlays = initialSelection.overlay
        ? [initialSelection.overlay]
        : [];
      this.populateMetricSelect();
      const initialMetric = initialSelection.metric;
      this.applyMetric(initialMetric);
      if (requestedMetricId !== initialSelection.selectionId) {
        this.replaceMetricUrl(initialSelection.selectionId);
      }

      const map = document.createElement('div');
      map.className = 'map map--loading';
      map.setAttribute('aria-label', `${initialMetric.label} by U.S. county`);
      this.mapCard.append(map);
      this.mapElement = map;

      this.choropleth = new CountyChoropleth(
        map,
        counties,
        states,
        initialMetric,
        (county) => this.selectCounty(county),
        () => {
          this.status.remove();
          this.scheduleBackgroundDataLoad(counties);
        },
      );
      if (initialSelection.overlay) {
        this.applyCategoryOverlay(initialSelection.overlay);
      }
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
    window.clearTimeout(this.backgroundLoadTimer);
    this.abortController.abort();
    this.choropleth?.destroy();
    this.detailOverlay?.destroy();
  }

  private scheduleBackgroundDataLoad(
    counties: CountyFeatureCollection,
  ) {
    if (this.backgroundLoadStarted) return;
    this.backgroundLoadStarted = true;
    this.backgroundLoadTimer = window.setTimeout(() => {
      const load = () => void this.loadBackgroundData(counties);
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(load, {timeout: 3_000});
      } else {
        load();
      }
    }, 1_500);
  }

  private async loadBackgroundData(
    counties: CountyFeatureCollection,
  ) {
    try {
      const [
        population,
        demographics,
        crime,
        ppp,
        h1b,
        medicaid,
        medicaidEnrollment,
      ] = await Promise.all([
        this.loadPopulation(),
        this.loadDemographics(),
        this.loadCrime(),
        this.loadPpp(),
        this.loadH1b(),
        this.loadMedicaid(),
        this.loadMedicaidEnrollment(),
      ]);
      if (this.abortController.signal.aborted) return;

      this.metrics = [
        population,
        createMedicaidEnrollmentPercentMetric(medicaidEnrollment),
        createMedicaidEnrollmentMetric(medicaidEnrollment),
        createMedicaidPerEnrolleeMetric(medicaid, medicaidEnrollment),
        createMedicaidMetric(medicaid),
        createPppMetric(ppp),
        createH1bMetric(h1b),
        createCrimeMetric(crime),
      ];
      this.categoryOverlays = [
        createEthnicityOverlay(demographics),
        createCrimeRaceOverlay(crime),
      ];
      const activeSelectionId = this.metricSelect.value;
      this.populateMetricSelect();
      this.detailOverlay = new CountyDetailOverlay(
        this.mapCard,
        counties.features[0],
        this.metric ?? this.metrics[0],
        demographics,
        crime,
        ppp,
        h1b,
        medicaid,
        medicaidEnrollment,
        () => this.clearSelection(),
      );

      this.applySelection(activeSelectionId);
      if (this.selectedCounty) this.detailOverlay.open(this.selectedCounty);
    } catch (error) {
      if (!this.abortController.signal.aborted) {
        console.error('Could not load background county data', error);
      }
    }
  }

  private async loadInitialSelection(
    requestedMetricId: string | null,
  ): Promise<InitialSelection> {
    switch (requestedMetricId) {
      case 'ppp-approved-amount': {
        const metric = createPppMetric(await this.loadPpp());
        return {metric, selectionId: metric.id};
      }
      case 'h1b-certified-worker-placements': {
        const metric = createH1bMetric(await this.loadH1b());
        return {metric, selectionId: metric.id};
      }
      case 'crime-offenses-2025': {
        const metric = createCrimeMetric(await this.loadCrime());
        return {metric, selectionId: metric.id};
      }
      case 'crime-known-offender-race-majority': {
        const crime = await this.loadCrime();
        const metric = createCrimeMetric(crime);
        return {
          metric,
          overlay: createCrimeRaceOverlay(crime),
          selectionId: requestedMetricId,
        };
      }
      case 'medicaid-paid-amount': {
        const metric = createMedicaidMetric(await this.loadMedicaid());
        return {metric, selectionId: metric.id};
      }
      case 'medicaid-enrollment-estimate': {
        const metric = createMedicaidEnrollmentMetric(
          await this.loadMedicaidEnrollment(),
        );
        return {metric, selectionId: metric.id};
      }
      case 'medicaid-enrollment-estimate-percent': {
        const metric = createMedicaidEnrollmentPercentMetric(
          await this.loadMedicaidEnrollment(),
        );
        return {metric, selectionId: metric.id};
      }
      case 'medicaid-paid-amount-per-estimated-enrollee': {
        const [medicaid, enrollment] = await Promise.all([
          this.loadMedicaid(),
          this.loadMedicaidEnrollment(),
        ]);
        const metric = createMedicaidPerEnrolleeMetric(medicaid, enrollment);
        return {metric, selectionId: metric.id};
      }
      case 'race-ethnicity-majority': {
        const [population, demographics] = await Promise.all([
          this.loadPopulation(),
          this.loadDemographics(),
        ]);
        return {
          metric: population,
          overlay: createEthnicityOverlay(demographics),
          selectionId: requestedMetricId,
        };
      }
      default: {
        const metric = await this.loadPopulation();
        return {metric, selectionId: metric.id};
      }
    }
  }

  private loadPopulation() {
    this.populationPromise ??= loadCountyMetric(
      '/data/county-population-2024.json',
      (value) => new Intl.NumberFormat('en-US').format(value),
      this.abortController.signal,
    );
    return this.populationPromise;
  }

  private loadDemographics() {
    this.demographicsPromise ??= loadCountyDemographics(
      this.abortController.signal,
    );
    return this.demographicsPromise;
  }

  private loadCrime() {
    this.crimePromise ??= loadCountyCrime(this.abortController.signal);
    return this.crimePromise;
  }

  private loadPpp() {
    this.pppPromise ??= loadCountyPpp(this.abortController.signal);
    return this.pppPromise;
  }

  private loadH1b() {
    this.h1bPromise ??= loadCountyH1b(this.abortController.signal);
    return this.h1bPromise;
  }

  private loadMedicaid() {
    this.medicaidPromise ??= loadCountyMedicaid(this.abortController.signal);
    return this.medicaidPromise;
  }

  private loadMedicaidEnrollment() {
    this.medicaidEnrollmentPromise ??= loadCountyMedicaidEnrollment(
      this.abortController.signal,
    );
    return this.medicaidEnrollmentPromise;
  }

  private selectCounty(county: CountyFeature) {
    if (this.selectedCounty?.properties.GEOID === county.properties.GEOID) {
      return;
    }
    this.selectedCounty = county;
    this.detailOverlay?.open(county);
    this.renderFooter(county);
    this.choropleth?.setSelection(county.properties.GEOID);
    trackGoogleAnalyticsEvent('county_select', {
      county_geoid: county.properties.GEOID,
      county_name: county.properties.NAMELSAD,
      state_code: county.properties.STUSPS,
      metric_id: this.metricSelect.value,
    });
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

  private applySelection(selectionId: string) {
    const overlay = this.categoryOverlays.find(
      (candidate) => candidate.id === selectionId,
    );
    if (overlay) {
      this.applyCategoryOverlay(overlay);
      return true;
    }
    const metric = this.metrics.find((candidate) => candidate.id === selectionId);
    if (metric) {
      this.applyMetric(metric);
      return true;
    }
    return false;
  }

  private applySelectionFromUrl() {
    if (this.metrics.length === 0) return;
    const selectionId = readMetricId(window.location.href);
    if (!selectionId || !this.applySelection(selectionId)) {
      const defaultMetric = this.metrics[0];
      this.applyMetric(defaultMetric);
      this.replaceMetricUrl(defaultMetric.id);
    }
    trackGoogleAnalyticsPageView();
  }

  private pushMetricUrl(metricId: string) {
    if (readMetricId(window.location.href) === metricId) return;
    window.history.pushState(
      null,
      '',
      createMetricUrl(window.location.href, metricId),
    );
    trackGoogleAnalyticsPageView();
  }

  private replaceMetricUrl(metricId: string) {
    if (readMetricId(window.location.href) === metricId) return;
    window.history.replaceState(
      null,
      '',
      createMetricUrl(window.location.href, metricId),
    );
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
