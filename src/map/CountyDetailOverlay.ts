import {Deck, WebMercatorViewport} from '@deck.gl/core';
import type {MapViewState} from '@deck.gl/core';
import {GeoJsonLayer} from '@deck.gl/layers';
import {getCountyBounds} from './geoBounds';
import type {CountyFeature, CountyMetric, CountyProperties} from './types';

export class CountyDetailOverlay {
  readonly element: HTMLDivElement;
  private readonly mapElement: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly title: HTMLHeadingElement;
  private readonly landArea: HTMLElement;
  private readonly waterArea: HTMLElement;
  private readonly geoid: HTMLElement;
  private readonly state: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.isOpen && event.key === 'Escape') this.onRequestClose();
  };
  private deck: Deck | null = null;
  private county: CountyFeature;
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
    private readonly metric: CountyMetric,
    private readonly onRequestClose: () => void,
  ) {
    this.county = initialCounty;
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
        <div class="county-detail__map">
          <div class="county-detail__map-note">Drag to pan · scroll to zoom</div>
        </div>
        <dl class="county-detail__stats">
          <div><dt class="county-detail__metric-label"></dt><dd data-detail="land"></dd></div>
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
    this.landArea = query(this.element, '[data-detail="land"]', HTMLElement);
    this.waterArea = query(this.element, '[data-detail="water"]', HTMLElement);
    this.geoid = query(this.element, '[data-detail="geoid"]', HTMLElement);
    this.state = query(this.element, '[data-detail="state"]', HTMLElement);
    query(
      this.element,
      '.county-detail__metric-label',
      HTMLElement,
    ).textContent = metric.label;
    this.updateText();

    this.closeButton.addEventListener('click', onRequestClose);
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
    this.landArea.textContent =
      metricValue == null ? 'No data' : this.metric.formatValue(metricValue);
    this.waterArea.textContent = formatSquareMiles(properties.AWATER);
    this.geoid.textContent = properties.GEOID;
    this.state.textContent = properties.STATE_NAME;
  }
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
