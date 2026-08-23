import {describe, expect, it} from 'vitest';
import {
  createLogScale,
  createQuantileScale,
  DEFAULT_PALETTE,
  NO_DATA_COLOR,
} from './colorScale';

describe('createQuantileScale', () => {
  it('provides ten sequential shades', () => {
    expect(DEFAULT_PALETTE).toHaveLength(10);
  });

  it('maps the domain endpoints into the first and final buckets', () => {
    const scale = createQuantileScale([0, 25, 50, 75, 100]);
    expect(scale.colorFor(0)).toEqual(DEFAULT_PALETTE[0]);
    expect(scale.colorFor(100)).toEqual(DEFAULT_PALETTE.at(-1));
  });

  it('uses a neutral color for missing or invalid values', () => {
    const scale = createQuantileScale([1, 2, 3]);
    expect(scale.colorFor(null)).toEqual(NO_DATA_COLOR);
    expect(scale.colorFor(Number.NaN)).toEqual(NO_DATA_COLOR);
  });

  it('handles an empty metric without creating invalid thresholds', () => {
    const scale = createQuantileScale([]);
    expect(scale.domain).toEqual([0, 1]);
    expect(scale.thresholds.every(Number.isFinite)).toBe(true);
  });

  it('uses quantiles so skewed metrics retain useful color variation', () => {
    const scale = createQuantileScale([1, 2, 3, 4, 5, 6, 7, 8, 1000]);
    expect(scale.thresholds[0]).toBeLessThan(10);
    expect(scale.colorFor(8)).toEqual(DEFAULT_PALETTE.at(-2));
    expect(scale.colorFor(1000)).toEqual(DEFAULT_PALETTE.at(-1));
  });
});

describe('createLogScale', () => {
  it('separates large values by magnitude instead of rank', () => {
    const scale = createLogScale([80, 200_000, 5_000_000, 10_000_000]);
    expect(scale.colorFor(200_000)).not.toEqual(scale.colorFor(5_000_000));
    expect(scale.colorFor(10_000_000)).toEqual(DEFAULT_PALETTE.at(-1));
  });

  it('places zero in the lowest bucket and preserves no-data color', () => {
    const scale = createLogScale([0, 10, 100]);
    expect(scale.colorFor(0)).toEqual(DEFAULT_PALETTE[0]);
    expect(scale.colorFor(null)).toEqual(NO_DATA_COLOR);
  });

});
