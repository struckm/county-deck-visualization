import type {Color} from './types';
import initializeWasmModule from '../wasm/colorScale.wasm?init';

type ColorScaleWasm = {
  resetValues: (length: number) => void;
  setValue: (index: number, value: number) => void;
  computeQuantile: (bucketCount: number) => void;
  computeLogarithmic: (bucketCount: number) => void;
  getDomainMinimum: () => number;
  getDomainMaximum: () => number;
  getThresholdCount: () => number;
  getThreshold: (index: number) => number;
};

let wasm: ColorScaleWasm | null = null;

export async function initializeColorScaleWasm(): Promise<void> {
  if (wasm) return;
  const instance = await initializeWasmModule(wasmImports());
  setWasmExports(instance);
}

export async function initializeColorScaleWasmFromBytes(
  bytes: BufferSource,
): Promise<void> {
  const result = await WebAssembly.instantiate(bytes, wasmImports());
  setWasmExports(result.instance);
}

function wasmImports(): WebAssembly.Imports {
  return {
    env: {
      abort() {
        throw new Error('The color-scale WebAssembly module aborted');
      },
    },
  };
}

function setWasmExports(instance: WebAssembly.Instance): void {
  wasm = instance.exports as unknown as ColorScaleWasm;
}

export function isColorScaleWasmInitialized(): boolean {
  return wasm !== null;
}

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
  const valid = finiteValues(values);
  const result = wasm
    ? calculateWithWasm(valid, palette.length, 'quantile')
    : calculateQuantilesInJavaScript(valid, palette.length);

  return {
    domain: result.domain,
    thresholds: result.thresholds,
    colorFor(value) {
      if (value == null || !Number.isFinite(value)) return NO_DATA_COLOR;
      const bucket = result.thresholds.findIndex(
        (threshold) => value < threshold,
      );
      return palette[bucket === -1 ? palette.length - 1 : bucket];
    },
  };
}

export function createLogScale(
  values: readonly (number | null | undefined)[],
  palette: readonly Color[] = DEFAULT_PALETTE,
): QuantileScale {
  const valid = finiteValues(values);
  const result = wasm
    ? calculateWithWasm(valid, palette.length, 'logarithmic')
    : calculateLogarithmsInJavaScript(valid, palette.length);

  return {
    domain: result.domain,
    thresholds: result.thresholds,
    colorFor(value) {
      if (value == null || !Number.isFinite(value)) return NO_DATA_COLOR;
      if (value <= 0) return palette[0];
      const bucket = result.thresholds.findIndex(
        (threshold) => value < threshold,
      );
      return palette[bucket === -1 ? palette.length - 1 : bucket];
    },
  };
}

type ScaleCalculation = {
  domain: readonly [number, number];
  thresholds: number[];
};

function finiteValues(
  values: readonly (number | null | undefined)[],
): number[] {
  return values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
}

function calculateWithWasm(
  values: readonly number[],
  bucketCount: number,
  mode: 'quantile' | 'logarithmic',
): ScaleCalculation {
  if (!wasm) throw new Error('Color-scale WebAssembly is not initialized');
  const engine = wasm;
  engine.resetValues(values.length);
  values.forEach((value, index) => engine.setValue(index, value));
  if (mode === 'quantile') engine.computeQuantile(bucketCount);
  else engine.computeLogarithmic(bucketCount);
  return {
    domain: [engine.getDomainMinimum(), engine.getDomainMaximum()],
    thresholds: Array.from(
      {length: engine.getThresholdCount()},
      (_, index) => engine.getThreshold(index),
    ),
  };
}

function calculateQuantilesInJavaScript(
  values: readonly number[],
  bucketCount: number,
): ScaleCalculation {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    domain: [sorted[0] ?? 0, sorted.at(-1) ?? 1],
    thresholds: Array.from(
      {length: Math.max(0, bucketCount - 1)},
      (_, index) => {
        if (!sorted.length) return (index + 1) / bucketCount;
        const position = ((sorted.length - 1) * (index + 1)) / bucketCount;
        const lower = Math.floor(position);
        const fraction = position - lower;
        return (
          sorted[lower] +
          (sorted[Math.ceil(position)] - sorted[lower]) * fraction
        );
      },
    ),
  };
}

function calculateLogarithmsInJavaScript(
  values: readonly number[],
  bucketCount: number,
): ScaleCalculation {
  const sorted = [...values].sort((a, b) => a - b);
  const positiveMinimum = sorted.find((value) => value > 0) ?? 1;
  const minimum = sorted[0] ?? 0;
  const maximum = sorted.at(-1) ?? 1;
  const logMinimum = Math.log(positiveMinimum);
  const logMaximum = Math.log(Math.max(maximum, positiveMinimum));
  return {
    domain: [minimum, maximum],
    thresholds: Array.from(
      {length: Math.max(0, bucketCount - 1)},
      (_, index) =>
        Math.exp(
          logMinimum +
            ((logMaximum - logMinimum) * (index + 1)) / bucketCount,
        ),
    ),
  };
}
