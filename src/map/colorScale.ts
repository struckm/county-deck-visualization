import type {Color} from './types';

export const DEFAULT_PALETTE: readonly Color[] = [
  [239, 247, 250, 230],
  [218, 235, 241, 232],
  [191, 220, 231, 234],
  [157, 201, 217, 236],
  [119, 181, 204, 239],
  [78, 158, 187, 242],
  [41, 133, 162, 245],
  [20, 105, 135, 247],
  [8, 80, 107, 249],
  [4, 54, 72, 251],
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

export function createLogScale(
  values: readonly (number | null | undefined)[],
  palette: readonly Color[] = DEFAULT_PALETTE,
): QuantileScale {
  const valid = values
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((a, b) => a - b);
  const positive = valid.filter((value) => value > 0);
  const min = valid[0] ?? 0;
  const max = valid.at(-1) ?? 1;
  const logMin = Math.log(positive[0] ?? 1);
  const logMax = Math.log(Math.max(max, positive[0] ?? 1));
  const thresholds = palette.slice(1).map((_, index) =>
    Math.exp(
      logMin + ((logMax - logMin) * (index + 1)) / palette.length,
    ),
  );

  return {
    domain: [min, max],
    thresholds,
    colorFor(value) {
      if (value == null || !Number.isFinite(value)) return NO_DATA_COLOR;
      if (value <= 0) return palette[0];
      const bucket = thresholds.findIndex((threshold) => value < threshold);
      return palette[bucket === -1 ? palette.length - 1 : bucket];
    },
  };
}
