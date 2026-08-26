import {Deck, WebMercatorViewport} from '@deck.gl/core';
import type {MapViewState} from '@deck.gl/core';
import {GeoJsonLayer} from '@deck.gl/layers';
import {getCountyBounds} from './geoBounds';
import type {
  CountyDemographics,
  CountyDemographicsDataset,
} from '../data/loadDemographics';
import type {
  CountyCrime,
  CountyCrimeDataset,
} from '../data/loadCrime';
import {
  formatCurrency,
  type CountyPpp,
  type CountyPppDataset,
} from '../data/loadPpp';
import {
  formatH1bCurrency,
  type CountyH1b,
  type CountyH1bDataset,
} from '../data/loadH1b';
import {
  formatMedicaidCurrency,
  type CountyMedicaid,
  type CountyMedicaidDataset,
} from '../data/loadMedicaid';
import type {
  CountyMedicaidEnrollment,
  CountyMedicaidEnrollmentDataset,
} from '../data/loadMedicaidEnrollment';
import type {CountyFeature, CountyMetric, CountyProperties} from './types';

export class CountyDetailOverlay {
  readonly element: HTMLDivElement;
  private readonly mapElement: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly title: HTMLHeadingElement;
  private readonly metricLabel: HTMLElement;
  private readonly metricValue: HTMLElement;
  private readonly waterArea: HTMLElement;
  private readonly geoid: HTMLElement;
  private readonly state: HTMLElement;
  private readonly demographicsPanel: HTMLElement;
  private readonly demographicsContent: HTMLElement;
  private readonly demographicsToggle: HTMLButtonElement;
  private readonly demographicsEyebrow: HTMLElement;
  private readonly demographicsTitle: HTMLHeadingElement;
  private readonly demographicsSource: HTMLAnchorElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.isOpen && event.key === 'Escape') this.onRequestClose();
  };
  private deck: Deck | null = null;
  private county: CountyFeature;
  private metric: CountyMetric;
  private isOpen = false;
  private updateFrame = 0;
  private revealAfterRender = false;
  private readonly handleAfterRender = () => {
    if (!this.revealAfterRender || !this.isOpen) return;
    this.revealAfterRender = false;
    this.element.classList.remove('county-detail-scrim--updating');
    this.closeButton.focus();
  };

  constructor(
    container: HTMLElement,
    initialCounty: CountyFeature,
    metric: CountyMetric,
    private readonly demographics: CountyDemographicsDataset,
    private readonly crime: CountyCrimeDataset,
    private readonly ppp: CountyPppDataset,
    private readonly h1b: CountyH1bDataset,
    private readonly medicaid: CountyMedicaidDataset,
    private readonly medicaidEnrollment: CountyMedicaidEnrollmentDataset,
    private readonly onRequestClose: () => void,
  ) {
    this.county = initialCounty;
    this.metric = metric;
    this.element = document.createElement('div');
    this.element.className = 'county-detail-scrim';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <section class="county-detail" aria-labelledby="county-detail-title">
        <header class="county-detail__header">
          <div>
            <span class="eyebrow">County detail</span>
            <h2 id="county-detail-title"></h2>
          </div>
          <button class="county-detail__close" type="button" aria-label="Close county detail" tabindex="-1">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div class="county-detail__map county-detail__map--demographics-open">
          <button class="county-detail__demographics-toggle" type="button" aria-expanded="true">
            Demographics
          </button>
          <aside class="county-detail__demographics" aria-label="County demographics">
            <header>
              <div>
                <span class="eyebrow">2024 demographics</span>
                <h3>Population profile</h3>
              </div>
              <button class="county-detail__demographics-close" type="button" aria-label="Hide detail profile">×</button>
            </header>
            <div class="county-detail__demographics-content"></div>
            <a class="county-detail__demographics-source" target="_blank" rel="noreferrer"></a>
          </aside>
          <div class="county-detail__map-note">Drag to pan · scroll to zoom</div>
        </div>
        <dl class="county-detail__stats">
          <div><dt class="county-detail__metric-label"></dt><dd data-detail="metric"></dd></div>
          <div><dt>Water area</dt><dd data-detail="water"></dd></div>
          <div><dt>FIPS / GEOID</dt><dd data-detail="geoid"></dd></div>
          <div><dt>State</dt><dd data-detail="state"></dd></div>
        </dl>
      </section>`;
    container.append(this.element);

    this.mapElement = query(this.element, '.county-detail__map', HTMLDivElement);
    this.closeButton = query(
      this.element,
      '.county-detail__close',
      HTMLButtonElement,
    );
    this.title = query(this.element, '#county-detail-title', HTMLHeadingElement);
    this.metricLabel = query(
      this.element,
      '.county-detail__metric-label',
      HTMLElement,
    );
    this.metricValue = query(
      this.element,
      '[data-detail="metric"]',
      HTMLElement,
    );
    this.waterArea = query(this.element, '[data-detail="water"]', HTMLElement);
    this.geoid = query(this.element, '[data-detail="geoid"]', HTMLElement);
    this.state = query(this.element, '[data-detail="state"]', HTMLElement);
    this.demographicsPanel = query(
      this.element,
      '.county-detail__demographics',
      HTMLElement,
    );
    this.demographicsContent = query(
      this.element,
      '.county-detail__demographics-content',
      HTMLElement,
    );
    this.demographicsToggle = query(
      this.element,
      '.county-detail__demographics-toggle',
      HTMLButtonElement,
    );
    const demographicsClose = query(
      this.element,
      '.county-detail__demographics-close',
      HTMLButtonElement,
    );
    this.demographicsEyebrow = query(
      this.element,
      '.county-detail__demographics .eyebrow',
      HTMLElement,
    );
    this.demographicsTitle = query(
      this.element,
      '.county-detail__demographics h3',
      HTMLHeadingElement,
    );
    this.demographicsSource = query(
      this.element,
      '.county-detail__demographics-source',
      HTMLAnchorElement,
    );
    this.metricLabel.textContent = metric.label;
    this.updateProfileLabels();
    this.updateText();

    this.closeButton.addEventListener('click', onRequestClose);
    this.demographicsToggle.addEventListener('click', () =>
      this.setDemographicsOpen(true),
    );
    demographicsClose.addEventListener('click', () =>
      this.setDemographicsOpen(false),
    );
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) onRequestClose();
    });
    window.addEventListener('keydown', this.handleKeyDown);

    this.resizeObserver = new ResizeObserver(() => this.updateDeck());
    this.resizeObserver.observe(this.mapElement);
    requestAnimationFrame(() => this.initializeDeck());
  }

  open(county: CountyFeature) {
    cancelAnimationFrame(this.updateFrame);
    this.revealAfterRender = false;
    this.county = county;
    this.isOpen = true;
    this.setDemographicsOpen(true);
    this.updateText();
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-hidden', 'false');
    this.closeButton.tabIndex = 0;
    this.element.classList.add(
      'county-detail-scrim--open',
      'county-detail-scrim--updating',
    );
    measurePopupLatency();

    this.updateFrame = requestAnimationFrame(() => this.updateDeck(true));
  }

  hide() {
    cancelAnimationFrame(this.updateFrame);
    this.revealAfterRender = false;
    this.isOpen = false;
    this.element.classList.remove(
      'county-detail-scrim--open',
      'county-detail-scrim--updating',
    );
    this.element.removeAttribute('role');
    this.element.removeAttribute('aria-modal');
    this.element.setAttribute('aria-hidden', 'true');
    this.closeButton.tabIndex = -1;
    this.deck?.setProps({controller: false});
  }

  setMetric(metric: CountyMetric) {
    this.metric = metric;
    this.metricLabel.textContent = metric.label;
    this.updateProfileLabels();
    this.updateText();
  }

  destroy() {
    cancelAnimationFrame(this.updateFrame);
    this.revealAfterRender = false;
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeyDown);
    this.deck?.finalize();
    this.element.remove();
  }

  private initializeDeck() {
    if (this.deck) return;
    this.deck = new Deck({
      parent: this.mapElement,
      initialViewState: this.createViewState(),
      controller: false,
      layers: [this.createLayer()],
      getCursor: ({isDragging}) => (isDragging ? 'grabbing' : 'grab'),
      onAfterRender: this.handleAfterRender,
    });
  }

  private updateDeck(revealAfterRender = false) {
    if (revealAfterRender) this.revealAfterRender = true;
    if (!this.deck) {
      this.initializeDeck();
      return;
    }
    this.deck.setProps({
      initialViewState: this.createViewState(),
      controller: this.isOpen
        ? {dragRotate: false, touchRotate: false}
        : false,
      layers: [this.createLayer()],
    });
  }

  private createLayer() {
    return new GeoJsonLayer<CountyProperties>({
      id: 'county-detail',
      data: [this.county],
      filled: true,
      stroked: true,
      pickable: false,
      getFillColor: [38, 117, 144, 220],
      getLineColor: [239, 183, 74, 255],
      getLineWidth: 2.5,
      lineWidthUnits: 'pixels',
    });
  }

  private createViewState(): MapViewState {
    const width = Math.max(1, this.mapElement.clientWidth);
    const height = Math.max(1, this.mapElement.clientHeight);
    const viewport = new WebMercatorViewport({width, height}).fitBounds(
      getCountyBounds(this.county),
      {
        padding: Math.min(width, height) * 0.14,
        maxZoom: 10,
      },
    );
    return {
      longitude: viewport.longitude,
      latitude: viewport.latitude,
      zoom: viewport.zoom,
      minZoom: Math.max(1, viewport.zoom - 3),
      maxZoom: 13,
      pitch: 0,
      bearing: 0,
    };
  }

  private updateText() {
    const properties = this.county.properties;
    const metricValue = this.metric.values.get(properties.GEOID);
    this.title.textContent = `${properties.NAMELSAD}, ${properties.STUSPS}`;
    this.mapElement.setAttribute(
      'aria-label',
      `Enlarged boundary of ${properties.NAMELSAD}`,
    );
    this.metricValue.textContent =
      metricValue == null ? 'No data' : this.metric.formatValue(metricValue);
    this.waterArea.textContent = formatSquareMiles(properties.AWATER);
    this.geoid.textContent = properties.GEOID;
    this.state.textContent = properties.STATE_NAME;
    this.renderProfile();
  }

  private setDemographicsOpen(isOpen: boolean) {
    this.mapElement.classList.toggle(
      'county-detail__map--demographics-open',
      isOpen,
    );
    this.demographicsPanel.setAttribute('aria-hidden', String(!isOpen));
    this.demographicsToggle.setAttribute('aria-expanded', String(isOpen));
  }

  private updateProfileLabels() {
    let toggle = 'Demographics';
    let ariaLabel = 'County demographics';
    let eyebrow = `${this.demographics.vintage} demographics`;
    let title = 'Population profile';
    let source = this.demographics.source;
    if (this.metric.id === this.crime.id) {
      toggle = 'Crime profile';
      ariaLabel = 'County crime profile';
      eyebrow = `${this.crime.vintage} NIBRS`;
      title = 'Known offender profile';
      source = this.crime.source;
    } else if (this.metric.id === this.ppp.id) {
      toggle = 'PPP profile';
      ariaLabel = 'County PPP profile';
      eyebrow = `${this.ppp.vintage} SBA`;
      title = 'PPP borrower profile';
      source = this.ppp.source;
    } else if (this.isH1bMetric()) {
      toggle = 'H-1B profile';
      ariaLabel = 'County H-1B labor condition application profile';
      eyebrow = `${this.h1b.vintage} DOL`;
      title = 'H-1B worksite activity';
      source = this.h1b.source;
    } else if (this.isMedicaidEnrollmentMetric()) {
      toggle = 'Coverage profile';
      ariaLabel = 'County Medicaid coverage estimate';
      eyebrow = `${this.medicaidEnrollment.vintage} ACS 5-year`;
      title = 'Medicaid coverage estimate';
      source = this.medicaidEnrollment.source;
    } else if (this.isMedicaidMetric()) {
      toggle = 'Medicaid profile';
      ariaLabel = 'County Medicaid spending profile';
      eyebrow = `${this.medicaid.vintage} HHS`;
      title = 'Medicaid provider spending';
      source = this.medicaid.source;
    }
    this.demographicsToggle.textContent = toggle;
    this.demographicsPanel.setAttribute('aria-label', ariaLabel);
    this.demographicsEyebrow.textContent = eyebrow;
    this.demographicsTitle.textContent = title;
    this.demographicsSource.textContent = source.label;
    this.demographicsSource.href = source.url;
  }

  private renderProfile() {
    if (this.metric.id === this.crime.id) {
      this.renderCrimeProfile();
      return;
    }
    if (this.metric.id === this.ppp.id) {
      this.renderPppProfile();
      return;
    }
    if (this.isH1bMetric()) {
      this.renderH1bProfile();
      return;
    }
    if (this.isMedicaidEnrollmentMetric()) {
      this.renderMedicaidEnrollmentProfile();
      return;
    }
    if (this.isMedicaidMetric()) {
      this.renderMedicaidProfile();
      return;
    }
    const demographics = this.demographics.counties.get(
      this.county.properties.GEOID,
    );
    if (!demographics) {
      const message = document.createElement('p');
      message.className = 'county-detail__demographics-empty';
      message.textContent = 'No demographic estimate is available.';
      this.demographicsContent.replaceChildren(message);
      return;
    }
    this.demographicsContent.replaceChildren(
      createDemographicGroup('Sex', demographics.total, [
        ['Female', demographics.female],
        ['Male', demographics.male],
      ]),
      createDemographicGroup(
        'Race & ethnicity',
        demographics.total,
        demographicGroups(demographics),
      ),
    );
  }

  private renderCrimeProfile() {
    const crime = this.crime.counties.get(this.county.properties.GEOID);
    if (!crime) {
      const message = document.createElement('p');
      message.className = 'county-detail__demographics-empty';
      message.textContent =
        'No 2025 NIBRS reports were attributed to this county.';
      this.demographicsContent.replaceChildren(message);
      return;
    }
    const caveat = document.createElement('p');
    caveat.className = 'county-detail__profile-caveat';
    caveat.textContent = this.crime.caveat;
    this.demographicsContent.replaceChildren(
      createCrimeSummary(crime),
      createDemographicGroup('Known offender sex', crime.offenders.total, [
        ['Male', crime.offenders.male],
        ['Female', crime.offenders.female],
        ['Unknown / not specified', crime.offenders.sexUnknown],
      ]),
      createDemographicGroup('Known offender ethnicity', crime.offenders.total, [
        ['Hispanic / Latino', crime.offenders.hispanic],
        ['Not Hispanic / Latino', crime.offenders.notHispanic],
        ['Multiple', crime.offenders.ethnicityMultiple],
        ['Unknown / not specified', crime.offenders.ethnicityUnknown],
      ]),
      createDemographicGroup(
        'Known offender race',
        crime.offenders.total,
        crimeRaceGroups(crime),
      ),
      caveat,
    );
  }

  private renderPppProfile() {
    const ppp = this.ppp.counties.get(this.county.properties.GEOID);
    if (!ppp) {
      const message = document.createElement('p');
      message.className = 'county-detail__demographics-empty';
      message.textContent = 'No PPP loans were attributed to this county.';
      this.demographicsContent.replaceChildren(message);
      return;
    }
    const caveat = document.createElement('p');
    caveat.className = 'county-detail__profile-caveat';
    caveat.textContent = this.ppp.caveat;
    this.demographicsContent.replaceChildren(
      createPppSummary(ppp),
      createDemographicGroup('Borrower-reported owner gender', ppp.loans, [
        ['Male owned', ppp.owners.male],
        ['Female owned', ppp.owners.female],
        ['Unanswered', ppp.owners.genderUnanswered],
      ]),
      createDemographicGroup('Borrower-reported owner ethnicity', ppp.loans, [
        ['Hispanic / Latino', ppp.owners.hispanic],
        ['Not Hispanic / Latino', ppp.owners.notHispanic],
        ['Unanswered', ppp.owners.ethnicityUnanswered],
      ]),
      createDemographicGroup(
        'Borrower-reported owner race',
        ppp.loans,
        pppRaceGroups(ppp),
      ),
      caveat,
    );
  }

  private renderMedicaidProfile() {
    const medicaid = this.medicaid.counties.get(this.county.properties.GEOID);
    if (!medicaid) {
      const message = document.createElement('p');
      message.className = 'county-detail__demographics-empty';
      message.textContent =
        'No 2024 Medicaid provider spending was attributed to this county.';
      this.demographicsContent.replaceChildren(message);
      return;
    }
    const caveat = document.createElement('p');
    caveat.className = 'county-detail__profile-caveat';
    caveat.textContent =
      `${this.medicaid.caveat} Paid per estimated enrollee divides these ` +
      `provider-location payments by the ACS estimate of residents with ` +
      `Medicaid or other means-tested public coverage. It is an analytical ` +
      `comparison, not an official CMS per-member cost. The age breakdown ` +
      `describes estimated enrollment, not spending by beneficiary age.`;
    const enrollment = this.medicaidEnrollment.counties.get(
      this.county.properties.GEOID,
    );
    const content: Node[] = [createMedicaidSummary(medicaid, enrollment)];
    if (enrollment) {
      content.push(
        createDemographicGroup('Estimated enrollment by age', enrollment.enrolled, [
          ['Under 19', enrollment.under19],
          ['Age 19–64', enrollment.age19To64],
          ['Age 65+', enrollment.age65Plus],
        ]),
      );
    }
    content.push(caveat);
    this.demographicsContent.replaceChildren(...content);
  }

  private renderH1bProfile() {
    const h1b = this.h1b.counties.get(this.county.properties.GEOID);
    if (!h1b) {
      const message = document.createElement('p');
      message.className = 'county-detail__demographics-empty';
      message.textContent =
        'No FY2025 H-1B worksite activity was attributed to this county.';
      this.demographicsContent.replaceChildren(message);
      return;
    }
    const caveat = document.createElement('p');
    caveat.className = 'county-detail__profile-caveat';
    caveat.textContent = this.h1b.caveat;
    const content: Node[] = [createH1bSummary(h1b)];
    if (h1b.topEmployers.length) {
      content.push(
        createDemographicGroup(
          'Top employers by certified placements',
          h1b.certifiedWorkerPlacements,
          h1b.topEmployers.map((item) => [
            item.name ?? 'Unknown employer',
            item.workerPlacements,
          ]),
        ),
      );
    }
    if (h1b.topOccupations.length) {
      content.push(
        createDemographicGroup(
          'Top occupations by certified placements',
          h1b.certifiedWorkerPlacements,
          h1b.topOccupations.map((item) => [
            item.title ?? 'Unknown occupation',
            item.workerPlacements,
          ]),
        ),
      );
    }
    content.push(caveat);
    this.demographicsContent.replaceChildren(...content);
  }

  private renderMedicaidEnrollmentProfile() {
    const enrollment = this.medicaidEnrollment.counties.get(
      this.county.properties.GEOID,
    );
    if (!enrollment) {
      const message = document.createElement('p');
      message.className = 'county-detail__demographics-empty';
      message.textContent = 'No Medicaid coverage estimate is available.';
      this.demographicsContent.replaceChildren(message);
      return;
    }
    const caveat = document.createElement('p');
    caveat.className = 'county-detail__profile-caveat';
    caveat.textContent = this.medicaidEnrollment.caveat;
    this.demographicsContent.replaceChildren(
      createMedicaidEnrollmentSummary(enrollment),
      createDemographicGroup('Estimated enrollment by age', enrollment.enrolled, [
        ['Under 19', enrollment.under19],
        ['Age 19–64', enrollment.age19To64],
        ['Age 65+', enrollment.age65Plus],
      ]),
      caveat,
    );
  }

  private isMedicaidMetric() {
    return (
      this.metric.id === this.medicaid.id ||
      this.metric.id.startsWith(`${this.medicaid.id}-`)
    );
  }

  private isH1bMetric() {
    return (
      this.metric.id === this.h1b.id ||
      this.metric.id.startsWith(`${this.h1b.id}-`)
    );
  }

  private isMedicaidEnrollmentMetric() {
    return (
      this.metric.id === this.medicaidEnrollment.id ||
      this.metric.id.startsWith(`${this.medicaidEnrollment.id}-`)
    );
  }
}

function createH1bSummary(h1b: CountyH1b) {
  const section = document.createElement('section');
  const heading = document.createElement('h4');
  heading.textContent = 'Certified LCA worksite activity';
  const list = document.createElement('dl');
  list.className = 'county-detail__crime-summary';
  const rows: Array<[string, string]> = [
    ['Certified worker placements', formatCount(h1b.certifiedWorkerPlacements)],
    ['Certified applications', formatCount(h1b.certifiedApplications)],
    ['Applications, all statuses', formatCount(h1b.applications)],
    ['Full-time placements', formatCount(h1b.fullTimeWorkerPlacements)],
    [
      'Secondary-entity placements',
      formatCount(h1b.secondaryEntityWorkerPlacements),
    ],
    [
      'Average offered annual wage',
      h1b.averageOfferedAnnualWage == null
        ? 'No data'
        : formatH1bCurrency(h1b.averageOfferedAnnualWage),
    ],
    [
      'Average prevailing annual wage',
      h1b.averagePrevailingAnnualWage == null
        ? 'No data'
        : formatH1bCurrency(h1b.averagePrevailingAnnualWage),
    ],
    [
      'Average offered-wage premium',
      h1b.averageWagePremiumPercent == null
        ? 'No data'
        : formatPercentage(h1b.averageWagePremiumPercent),
    ],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    list.append(row);
  }
  section.append(heading, list);
  return section;
}

function createMedicaidEnrollmentSummary(
  enrollment: CountyMedicaidEnrollment,
) {
  const section = document.createElement('section');
  const heading = document.createElement('h4');
  heading.textContent = 'Coverage estimate';
  const list = document.createElement('dl');
  list.className = 'county-detail__crime-summary';
  const rows: Array<[string, string]> = [
    ['Estimated covered', formatCount(enrollment.enrolled)],
    ['90% margin of error', `±${formatCount(enrollment.enrolledMoe)}`],
    [
      'Coverage rate',
      enrollment.enrollmentPercent == null
        ? 'No data'
        : formatPercentage(enrollment.enrollmentPercent),
    ],
    ['Survey population', formatCount(enrollment.population)],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    list.append(row);
  }
  section.append(heading, list);
  return section;
}

function createMedicaidSummary(
  medicaid: CountyMedicaid,
  enrollment?: CountyMedicaidEnrollment,
) {
  const section = document.createElement('section');
  const heading = document.createElement('h4');
  heading.textContent = 'Attributed provider activity';
  const list = document.createElement('dl');
  list.className = 'county-detail__crime-summary';
  const paidPerLine = medicaid.claimLines
    ? medicaid.paid / medicaid.claimLines
    : 0;
  const rows: Array<[string, string]> = [
    ['Paid amount', formatMedicaidCurrency(medicaid.paid)],
    ['Providers', formatCount(medicaid.providers)],
    ['Claim lines', formatCount(medicaid.claimLines)],
    ['Paid per claim line', formatMedicaidCurrency(paidPerLine)],
    ['Published service cells', formatCount(medicaid.serviceCells)],
    ['Negative adjustment cells', formatCount(medicaid.adjustmentCells)],
  ];
  if (enrollment) {
    rows.splice(
      1,
      0,
      ['Estimated covered residents', formatCount(enrollment.enrolled)],
      [
        'Paid per estimated enrollee',
        enrollment.enrolled === 0
          ? 'No data'
          : formatMedicaidCurrency(medicaid.paid / enrollment.enrolled),
      ],
    );
  }
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    list.append(row);
  }
  section.append(heading, list);
  return section;
}

function createPppSummary(ppp: CountyPpp) {
  const section = document.createElement('section');
  const heading = document.createElement('h4');
  heading.textContent = 'PPP activity';
  const list = document.createElement('dl');
  list.className = 'county-detail__crime-summary';
  for (const [label, value] of [
    ['Loans', formatCount(ppp.loans)],
    ['Approved amount', formatCurrency(ppp.approved)],
    ['Forgiveness amount', formatCurrency(ppp.forgiven)],
    ['Jobs reported', formatCount(ppp.jobs)],
  ]) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    list.append(row);
  }
  section.append(heading, list);
  return section;
}

function pppRaceGroups(ppp: CountyPpp): Array<[string, number]> {
  return [
    ['White', ppp.owners.white],
    ['Black / African American', ppp.owners.black],
    ['American Indian / Alaska Native', ppp.owners.native],
    ['Asian', ppp.owners.asian],
    ['Native Hawaiian / Pacific Islander', ppp.owners.pacificIslander],
    ['Multiple races', ppp.owners.multiracial],
    ['Other reported race', ppp.owners.otherRace],
    ['Unanswered', ppp.owners.raceUnanswered],
  ];
}

function createCrimeSummary(crime: CountyCrime) {
  const section = document.createElement('section');
  const heading = document.createElement('h4');
  heading.textContent = 'Reported activity';
  const list = document.createElement('dl');
  list.className = 'county-detail__crime-summary';
  for (const [label, value] of [
    ['Group A offenses', crime.offenses],
    ['Incidents', crime.incidents],
    ['Known offender records', crime.offenders.total],
  ] as Array<[string, number]>) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = formatCount(value);
    row.append(term, detail);
    list.append(row);
  }
  section.append(heading, list);
  return section;
}

function crimeRaceGroups(crime: CountyCrime): Array<[string, number]> {
  return [
    ['White', crime.offenders.white],
    ['Black / African American', crime.offenders.black],
    ['American Indian / Alaska Native', crime.offenders.native],
    ['Asian', crime.offenders.asian],
    ['Native Hawaiian / Pacific Islander', crime.offenders.pacificIslander],
    ['Multiple races', crime.offenders.multiracial],
    ['Unknown / not specified', crime.offenders.raceUnknown],
  ];
}

function demographicGroups(
  demographics: CountyDemographics,
): Array<[string, number]> {
  return [
    ['Hispanic / Latino', demographics.hispanic],
    ['White, non-Hispanic', demographics.whiteNonHispanic],
    ['Black, non-Hispanic', demographics.blackNonHispanic],
    ['Asian, non-Hispanic', demographics.asianNonHispanic],
    ['American Indian / Alaska Native', demographics.nativeNonHispanic],
    ['Native Hawaiian / Pacific Islander', demographics.pacificIslanderNonHispanic],
    ['Two or more races, non-Hispanic', demographics.multiracialNonHispanic],
  ];
}

function createDemographicGroup(
  title: string,
  total: number,
  entries: Array<[string, number]>,
) {
  const section = document.createElement('section');
  const heading = document.createElement('h4');
  heading.textContent = title;
  section.append(heading);
  for (const [label, value] of entries) {
    const percentage = total ? (value / total) * 100 : 0;
    const row = document.createElement('div');
    row.className = 'demographic-row';
    const text = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = `${formatCount(value)} · ${formatPercentage(percentage)}`;
    text.append(name, amount);
    const track = document.createElement('div');
    track.className = 'demographic-row__track';
    const bar = document.createElement('span');
    bar.style.width = `${percentage}%`;
    track.append(bar);
    row.append(text, track);
    section.append(row);
  }
  return section;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercentage(value: number) {
  if (value > 0 && value < 0.1) return '<0.1%';
  return `${value.toFixed(1)}%`;
}

function measurePopupLatency() {
  if (
    !import.meta.env.DEV ||
    performance.getEntriesByName('county-popup-input', 'mark').length === 0
  ) {
    return;
  }
  performance.clearMeasures('county-popup-visible');
  const measurement = performance.measure(
    'county-popup-visible',
    'county-popup-input',
  );
  document.documentElement.dataset.popupLatencyMs =
    measurement.duration.toFixed(2);
}

function formatSquareMiles(squareMeters: number) {
  const squareMiles = squareMeters / 2_589_988.110336;
  return `${new Intl.NumberFormat('en-US', {maximumFractionDigits: 1}).format(squareMiles)} sq mi`;
}

function query<T extends Element>(
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
