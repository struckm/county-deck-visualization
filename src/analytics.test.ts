import {describe, expect, it} from 'vitest';
import {isGoogleAnalyticsMeasurementId} from './analytics';

describe('Google Analytics configuration', () => {
  it('accepts GA4 measurement IDs', () => {
    expect(isGoogleAnalyticsMeasurementId('G-PSW1MY7HB4')).toBe(true);
    expect(isGoogleAnalyticsMeasurementId(' g-abc123 ')).toBe(true);
  });

  it('rejects missing and non-GA4 identifiers', () => {
    expect(isGoogleAnalyticsMeasurementId(undefined)).toBe(false);
    expect(isGoogleAnalyticsMeasurementId('')).toBe(false);
    expect(isGoogleAnalyticsMeasurementId('UA-12345-6')).toBe(false);
    expect(isGoogleAnalyticsMeasurementId('G-ABC_123')).toBe(false);
  });
});
