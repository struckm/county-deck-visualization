import type {Color} from './types';

export const DEFAULT_PALETTE: readonly Color[] = [
  [232, 241, 247, 230],
  [178, 211, 226, 235],
  [102, 166, 192, 240],
  [38, 117, 144, 245],
  [8, 65, 87, 250],
];

export const NO_DATA_COLOR: Color = [214, 219, 220, 190];

export type QuantileScale = {
  domain: readonly [number, number];
  thresholds: readonly number[];
  colorFor: (value: number | null | undefined) => Color;
};

export function createQuantileScale(
  values: readonly (number | null | undefined)[],
  palette: readonly Color[] = DEFAULT_PALETTE,
): QuantileScale {
  const valid = values
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((a, b) => a - b);
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 1;
  const thresholds = palette.slice(1).map((_, index) => {
    if (!valid.length) return (index + 1) / palette.length;
    const position = ((valid.length - 1) * (index + 1)) / palette.length;
    const lower = Math.floor(position);
    const fraction = position - lower;
    return valid[lower] + (valid[Math.ceil(position)] - valid[lower]) * fraction;
  });

  return {
    domain: [min, max],
    thresholds,
    colorFor(value) {
      if (value == null || !Number.isFinite(value)) return NO_DATA_COLOR;
      const bucket = thresholds.findIndex((threshold) => value < threshold);
      return palette[bucket === -1 ? palette.length - 1 : bucket];
    },
  };
}
