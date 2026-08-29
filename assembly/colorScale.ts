let values = new StaticArray<f64>(0);
let thresholds = new StaticArray<f64>(0);
let domainMinimum = 0.0;
let domainMaximum = 1.0;

export function resetValues(length: i32): void {
  values = new StaticArray<f64>(length);
}

export function setValue(index: i32, value: f64): void {
  values[index] = value;
}

export function computeQuantile(bucketCount: i32): void {
  const sorted = sortedValues();
  const length = sorted.length;
  resetThresholds(bucketCount);

  if (length === 0) {
    domainMinimum = 0.0;
    domainMaximum = 1.0;
    for (let index = 0; index < thresholds.length; index += 1) {
      thresholds[index] = <f64>(index + 1) / <f64>bucketCount;
    }
    return;
  }

  domainMinimum = sorted[0];
  domainMaximum = sorted[length - 1];
  for (let index = 0; index < thresholds.length; index += 1) {
    const position =
      (<f64>(length - 1) * <f64>(index + 1)) / <f64>bucketCount;
    const lower = <i32>Math.floor(position);
    const upper = <i32>Math.ceil(position);
    const fraction = position - <f64>lower;
    thresholds[index] =
      sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
  }
}

export function computeLogarithmic(bucketCount: i32): void {
  const sorted = sortedValues();
  const length = sorted.length;
  resetThresholds(bucketCount);
  domainMinimum = length > 0 ? sorted[0] : 0.0;
  domainMaximum = length > 0 ? sorted[length - 1] : 1.0;

  let positiveMinimum = 1.0;
  for (let index = 0; index < length; index += 1) {
    if (sorted[index] > 0.0) {
      positiveMinimum = sorted[index];
      break;
    }
  }

  const logMinimum = Math.log(positiveMinimum);
  const logMaximum = Math.log(Math.max(domainMaximum, positiveMinimum));
  for (let index = 0; index < thresholds.length; index += 1) {
    thresholds[index] = Math.exp(
      logMinimum +
        ((logMaximum - logMinimum) * <f64>(index + 1)) / <f64>bucketCount,
    );
  }
}

export function getDomainMinimum(): f64 {
  return domainMinimum;
}

export function getDomainMaximum(): f64 {
  return domainMaximum;
}

export function getThresholdCount(): i32 {
  return thresholds.length;
}

export function getThreshold(index: i32): f64 {
  return thresholds[index];
}

function resetThresholds(bucketCount: i32): void {
  thresholds = new StaticArray<f64>(bucketCount > 1 ? bucketCount - 1 : 0);
}

function sortedValues(): StaticArray<f64> {
  const sorted = new StaticArray<f64>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    sorted[index] = values[index];
  }
  if (sorted.length > 1) quickSort(sorted, 0, sorted.length - 1);
  return sorted;
}

function quickSort(items: StaticArray<f64>, left: i32, right: i32): void {
  let low = left;
  let high = right;
  const pivot = items[left + ((right - left) >> 1)];

  while (low <= high) {
    while (items[low] < pivot) low += 1;
    while (items[high] > pivot) high -= 1;
    if (low <= high) {
      const value = items[low];
      items[low] = items[high];
      items[high] = value;
      low += 1;
      high -= 1;
    }
  }

  if (left < high) quickSort(items, left, high);
  if (low < right) quickSort(items, low, right);
}
