import {Deck} from '@deck.gl/core';
import type {MapViewState, PickingInfo} from '@deck.gl/core';
import {GeoJsonLayer} from '@deck.gl/layers';
import {
  createLogScale,
  createQuantileScale,
  DEFAULT_PALETTE,
  NO_DATA_COLOR,
} from './colorScale';
import type {
  Color,
  CountyCategoryOverlay,
  CountyFeature,
  CountyFeatureCollection,
  CountyMetric,
  CountyProperties,
  StateFeatureCollection,
  StateProperties,
} from './types';

const US_VIEW_STATE: MapViewState = {
  longitude: -98.4,
  latitude: 38.1,
  zoom: 3.25,
  minZoom: 2,
  maxZoom: 12,
  pitch: 0,
  bearing: 0,
};

export class CountyChoropleth {
  readonly deck: Deck;
  private readonly countiesByGeoid: Map<string, CountyFeature>;
  private readonly resizeObserver: ResizeObserver;
  private mainLayer: GeoJsonLayer<CountyProperties>;
  private readonly stateLayer: GeoJsonLayer<StateProperties>;
  private selectionLayer: GeoJsonLayer<CountyProperties>;
  private legend: HTMLDivElement;
  private categoryOverlay: CountyCategoryOverlay | null = null;
  private hoveredCounty: CountyFeature | null = null;
  private pointerStart: {
    x: number;
    y: number;
    county: CountyFeature | null;
  } | null = null;
  private lastImmediateSelection = 0;
  private initialViewRenderCount = 0;
  private initialViewFrame = 0;
  private readonly handleAfterRender = () => {
    if (this.initialViewRenderCount === 0) {
      this.initialViewRenderCount = 1;
      this.initialViewFrame = requestAnimationFrame(() => {
        if (this.initialViewRenderCount !== 1) return;
        this.deck.setProps({
          initialViewState: responsiveViewState(this.container.clientWidth),
        });
      });
      return;
    }
    if (this.initialViewRenderCount === 1) {
      this.initialViewRenderCount = 2;
      cancelAnimationFrame(this.initialViewFrame);
      this.container.classList.remove('map--loading');
      this.onReady();
    }
  };
  private readonly handlePointerDown = (event: PointerEvent) => {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      !(event.target instanceof HTMLCanvasElement)
    ) {
      return;
    }
    this.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      county: this.hoveredCounty,
    };
  };
  private readonly handlePointerUp = (event: PointerEvent) => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || !event.isPrimary) return;
    const movement = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (movement > 4) return;
    markPopupInput();
    const bounds = this.container.getBoundingClientRect();
    const picked =
      start.county ??
      (this.deck.pickObject({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        layerIds: [this.mainLayer.id],
      })?.object as CountyFeature | undefined);
    if (!picked) return;
    this.lastImmediateSelection = performance.now();
    this.onSelect(picked);
  };
  private readonly handlePointerCancel = () => {
    this.pointerStart = null;
  };

  constructor(
    private readonly container: HTMLDivElement,
    private readonly counties: CountyFeatureCollection,
    states: StateFeatureCollection,
    private metric: CountyMetric,
    private readonly onSelect: (county: CountyFeature) => void,
    private readonly onReady: () => void = () => {},
  ) {
    const scale = createScale(metric);
    this.countiesByGeoid = new Map(
      counties.features.map((county) => [county.properties.GEOID, county]),
    );
    this.mainLayer = this.createMainLayer(scale);
    this.stateLayer = createStateLayer(states);
    this.selectionLayer = this.createSelectionLayer();

    this.deck = new Deck({
      parent: container,
      initialViewState: responsiveViewState(container.clientWidth),
      controller: {dragRotate: false, touchRotate: false},
      layers: [this.mainLayer, this.stateLayer, this.selectionLayer],
      getCursor: ({isDragging, isHovering}) =>
        isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab',
      onAfterRender: this.handleAfterRender,
      onHover: ({object}: PickingInfo<CountyFeature>) => {
        this.hoveredCounty = object ?? null;
      },
      getTooltip: ({object}: PickingInfo<CountyFeature>) => {
        if (!object) return null;
        return {
          text: this.getTooltipText(object),
          className: 'county-tooltip',
        };
      },
    });

    this.legend = createLegend(metric, scale);
    this.container.append(this.legend);
    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.deck.setProps({
        initialViewState: responsiveViewState(entry.contentRect.width),
      });
    });
    this.resizeObserver.observe(container);
    container.addEventListener('pointerdown', this.handlePointerDown);
    container.addEventListener('pointerup', this.handlePointerUp);
    container.addEventListener('pointercancel', this.handlePointerCancel);
  }

  setSelection(geoid: string | null) {
    this.selectionLayer = this.createSelectionLayer(
      geoid ? this.countiesByGeoid.get(geoid) : undefined,
    );
    this.deck.setProps({
      layers: [this.mainLayer, this.stateLayer, this.selectionLayer],
    });
  }

  setMetric(metric: CountyMetric) {
    this.metric = metric;
    this.refreshVisualization();
  }

  setCategoryOverlay(overlay: CountyCategoryOverlay | null) {
    this.categoryOverlay = overlay;
    this.refreshVisualization();
  }

  destroy() {
    cancelAnimationFrame(this.initialViewFrame);
    this.resizeObserver.disconnect();
    this.container.removeEventListener('pointerdown', this.handlePointerDown);
    this.container.removeEventListener('pointerup', this.handlePointerUp);
    this.container.removeEventListener('pointercancel', this.handlePointerCancel);
    this.deck.finalize();
  }

  private createSelectionLayer(county?: CountyFeature) {
    return new GeoJsonLayer<CountyProperties>({
      id: 'selected-county',
      data: county ? [county] : [],
      filled: false,
      stroked: true,
      pickable: false,
      getLineColor: [239, 183, 74, 255],
      getLineWidth: 3,
      lineWidthUnits: 'pixels',
    });
  }

  private createMainLayer(
    scale: ReturnType<typeof createQuantileScale>,
  ) {
    const overlay = this.categoryOverlay;
    const categoryColors = new Map(
      overlay?.categories.map(({id, color}) => [id, color]),
    );
    return new GeoJsonLayer<CountyProperties>({
      id: `counties-${overlay?.id ?? this.metric.id}`,
      data: this.counties,
      filled: true,
      stroked: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      getFillColor: (feature) => {
        if (!overlay) {
          return scale.colorFor(
            this.metric.values.get(feature.properties.GEOID),
          );
        }
        const category = overlay.values.get(feature.properties.GEOID);
        if (category === undefined) return NO_DATA_COLOR;
        return categoryColors.get(category) ?? NO_DATA_COLOR;
      },
      getLineColor: [255, 255, 255, 115],
      getLineWidth: 0.7,
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 0.35,
      onClick: ({object}: PickingInfo<CountyFeature>) => {
        if (
          object &&
          performance.now() - this.lastImmediateSelection > 150
        ) {
          markPopupInput();
          this.onSelect(object);
        }
      },
    });
  }

  private refreshVisualization() {
    const scale = createScale(this.metric);
    this.mainLayer = this.createMainLayer(scale);
    const legend = this.categoryOverlay
      ? createCategoryLegend(this.categoryOverlay)
      : createLegend(this.metric, scale);
    this.legend.replaceWith(legend);
    this.legend = legend;
    this.deck.setProps({
      layers: [this.mainLayer, this.stateLayer, this.selectionLayer],
    });
  }

  private getTooltipText(county: CountyFeature) {
    const countyName = `${county.properties.NAMELSAD}, ${county.properties.STUSPS}`;
    const overlay = this.categoryOverlay;
    if (!overlay) {
      const value = this.metric.values.get(county.properties.GEOID);
      return `${countyName}\n${this.metric.label}: ${value == null ? 'No data' : this.metric.formatValue(value)}`;
    }
    const category = overlay.values.get(county.properties.GEOID);
    const label =
      category === undefined
        ? 'No data'
        : overlay.categories.find(({id}) => id === category)?.label ??
          'No data';
    return `${countyName}\nLargest group: ${label}`;
  }
}

function createStateLayer(states: StateFeatureCollection) {
  return new GeoJsonLayer<StateProperties>({
    id: 'state-boundaries',
    data: states,
    filled: false,
    stroked: true,
    pickable: false,
    getLineColor: [15, 35, 43, 235],
    getLineWidth: 1.35,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
  });
}

function markPopupInput() {
  if (!import.meta.env.DEV) return;
  performance.clearMarks('county-popup-input');
  performance.mark('county-popup-input');
}

function createScale(metric: CountyMetric) {
  const values = [...metric.values.values()];
  return metric.scale === 'log'
    ? createLogScale(values)
    : createQuantileScale(values);
}

function responsiveViewState(containerWidth: number): MapViewState {
  const zoomAdjustment = Math.min(0, Math.log2(containerWidth / 960));
  return {
    ...US_VIEW_STATE,
    zoom: US_VIEW_STATE.zoom + zoomAdjustment,
    minZoom: 1.25,
  };
}

function createLegend(
  metric: CountyMetric,
  scale: ReturnType<typeof createQuantileScale>,
) {
  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.setAttribute('aria-label', `${metric.label} legend`);

  const label = document.createElement('div');
  label.className = 'map-legend__label';
  label.textContent = metric.label;

  const swatches = document.createElement('div');
  swatches.className = 'map-legend__swatches';
  swatches.setAttribute('aria-hidden', 'true');
  const boundaries = [scale.domain[0], ...scale.thresholds, scale.domain[1]];
  DEFAULT_PALETTE.forEach((color, index) => {
    const swatch = document.createElement('span');
    swatch.style.background = toCssColor(color);
    swatch.title = `${metric.formatValue(boundaries[index])}–${metric.formatValue(boundaries[index + 1])}`;
    swatches.append(swatch);
  });

  const range = document.createElement('div');
  range.className = 'map-legend__range';
  const minimum = document.createElement('span');
  minimum.textContent = metric.formatValue(scale.domain[0]);
  const maximum = document.createElement('span');
  maximum.textContent = metric.formatValue(scale.domain[1]);
  range.append(minimum, maximum);
  legend.append(label, swatches, range);
  return legend;
}

function createCategoryLegend(overlay: CountyCategoryOverlay) {
  const legend = document.createElement('div');
  legend.className = 'map-legend map-legend--categories';
  legend.setAttribute('aria-label', `${overlay.label} legend`);
  const label = document.createElement('div');
  label.className = 'map-legend__label';
  label.textContent = overlay.label;
  const categories = document.createElement('div');
  categories.className = 'map-legend__categories';
  for (const category of overlay.categories) {
    categories.append(
      createCategoryLegendRow(
        category.color,
        category.label,
        category.countyCount,
      ),
    );
  }
  legend.append(label, categories);
  return legend;
}

function createCategoryLegendRow(
  color: Color,
  label: string,
  count?: number,
) {
  const row = document.createElement('div');
  const swatch = document.createElement('span');
  swatch.style.background = toCssColor(color);
  const text = document.createElement('span');
  text.textContent = label;
  row.append(swatch, text);
  if (count != null) {
    const total = document.createElement('strong');
    total.textContent = new Intl.NumberFormat('en-US').format(count);
    row.append(total);
  }
  return row;
}

function toCssColor([red, green, blue, alpha]: Color) {
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}
