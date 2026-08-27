import {describe, expect, it} from 'vitest';
import {createMetricUrl, readMetricId} from './urlState';

describe('metric URL state', () => {
  it('reads a metric id from a deep link', () => {
    expect(readMetricId('https://example.test/map?metric=h1b-fy2025')).toBe(
      'h1b-fy2025',
    );
  });

  it('treats a missing or empty metric id as absent', () => {
    expect(readMetricId('https://example.test/map')).toBeNull();
    expect(readMetricId('https://example.test/map?metric=')).toBeNull();
  });

  it('updates the metric while preserving other URL state', () => {
    expect(
      createMetricUrl(
        'https://example.test/map?county=06085&metric=population#details',
        'h1b-fy2025',
      ),
    ).toBe('/map?county=06085&metric=h1b-fy2025#details');
  });

  it('encodes metric ids safely', () => {
    expect(
      createMetricUrl('https://example.test/map', 'metric with spaces'),
    ).toBe('/map?metric=metric+with+spaces');
  });
});
