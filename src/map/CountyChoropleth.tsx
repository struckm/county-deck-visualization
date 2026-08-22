import {useEffect, useMemo, useRef, useState} from 'react';
import {DeckGL} from '@deck.gl/react';
import {GeoJsonLayer} from '@deck.gl/layers';
import type {MapViewState, PickingInfo} from '@deck.gl/core';
import {createQuantileScale, DEFAULT_PALETTE} from './colorScale';
import type {
  Color,
  CountyFeature,
  CountyFeatureCollection,
  CountyMetric,
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

type CountyChoroplethProps = {
  counties: CountyFeatureCollection;
  metric: CountyMetric;
  selectedGeoid?: string | null;
  onSelect?: (county: CountyFeature | null) => void;
  initialViewState?: MapViewState;
  className?: string;
};

export function CountyChoropleth({
  counties,
  metric,
  selectedGeoid = null,
  onSelect,
  initialViewState = US_VIEW_STATE,
  className,
}: CountyChoroplethProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const scale = useMemo(
    () => createQuantileScale([...metric.values.values()]),
    [metric.values],
  );
  const responsiveViewState = useMemo(() => {
    if (!containerWidth) return initialViewState;
    const zoomAdjustment = Math.min(0, Math.log2(containerWidth / 960));
    return {
      ...initialViewState,
      zoom: initialViewState.zoom + zoomAdjustment,
      minZoom: Math.min(initialViewState.minZoom ?? 2, 1.25),
    };
  }, [containerWidth, initialViewState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const layers = useMemo(() => {
    const countiesLayer = new GeoJsonLayer<CountyProperties>({
      id: `counties-${metric.id}`,
      data: counties,
      filled: true,
      stroked: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      getFillColor: (feature) =>
        scale.colorFor(metric.values.get(feature.properties.GEOID)),
      getLineColor: [255, 255, 255, 115],
      getLineWidth: 0.7,
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 0.35,
      updateTriggers: {
        getFillColor: [metric.values, scale],
      },
      onClick: ({object}: PickingInfo<CountyFeature>) => onSelect?.(object ?? null),
    });

    const selected = selectedGeoid
      ? counties.features.filter(
          (feature) => feature.properties.GEOID === selectedGeoid,
        )
      : [];
    const selectionLayer = new GeoJsonLayer<CountyProperties>({
      id: 'selected-county',
      data: selected,
      filled: false,
      stroked: true,
      pickable: false,
      getLineColor: [239, 183, 74, 255],
      getLineWidth: 3,
      lineWidthUnits: 'pixels',
    });

    return [countiesLayer, selectionLayer];
  }, [counties, metric, onSelect, scale, selectedGeoid]);

  return (
    <div
      ref={containerRef}
      className={className}
      aria-label={`${metric.label} by U.S. county`}
    >
      <DeckGL
        initialViewState={responsiveViewState}
        controller={{dragRotate: false, touchRotate: false}}
        layers={layers}
        getCursor={({isDragging, isHovering}) =>
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
        }
        getTooltip={({object}: PickingInfo<CountyFeature>) => {
          if (!object) return null;
          const value = metric.values.get(object.properties.GEOID);
          return {
            text: `${object.properties.NAMELSAD}, ${object.properties.STUSPS}\n${metric.label}: ${value == null ? 'No data' : metric.formatValue(value)}`,
            className: 'county-tooltip',
          };
        }}
      />
      <MapLegend metric={metric} scale={scale} />
    </div>
  );
}

type CountyProperties = CountyFeature['properties'];

function MapLegend({
  metric,
  scale,
}: {
  metric: CountyMetric;
  scale: ReturnType<typeof createQuantileScale>;
}) {
  const boundaries = [scale.domain[0], ...scale.thresholds, scale.domain[1]];

  return (
    <div className="map-legend" aria-label={`${metric.label} legend`}>
      <div className="map-legend__label">{metric.label}</div>
      <div className="map-legend__swatches" aria-hidden="true">
        {DEFAULT_PALETTE.map((color, index) => (
          <span
            key={index}
            style={{background: toCssColor(color)}}
            title={`${metric.formatValue(boundaries[index])}–${metric.formatValue(boundaries[index + 1])}`}
          />
        ))}
      </div>
      <div className="map-legend__range">
        <span>{metric.formatValue(scale.domain[0])}</span>
        <span>{metric.formatValue(scale.domain[1])}</span>
      </div>
    </div>
  );
}

function toCssColor([red, green, blue, alpha]: Color) {
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}
