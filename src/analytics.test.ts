import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  trackGoogleAnalyticsEvent,
  trackGoogleAnalyticsPageView,
} from './analytics';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google Analytics tag', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('uses the configured GA4 measurement ID in the standard Google tag', () => {
    expect(html).toContain(
      'https://www.googletagmanager.com/gtag/js?id=G-7S4TK8S2RS',
    );
    expect(html).toContain("gtag('config', 'G-7S4TK8S2RS')");
    expect(html).toContain('function gtag(){dataLayer.push(arguments);}');
  });
});

describe('Google Analytics events', () => {
  it('sends a named event with its parameters', () => {
    const gtag = vi.fn();
    vi.stubGlobal('window', {gtag});

    trackGoogleAnalyticsEvent('metric_select', {
      metric_id: 'h1b-certified-worker-placements',
    });

    expect(gtag).toHaveBeenCalledWith('event', 'metric_select', {
      metric_id: 'h1b-certified-worker-placements',
    });
  });

  it('sends page location and title with virtual page views', () => {
    const gtag = vi.fn();
    vi.stubGlobal('window', {
      gtag,
      location: {href: 'https://www.markstruck.com/?metric=population-2024'},
    });
    vi.stubGlobal('document', {title: 'U.S. County Atlas'});

    trackGoogleAnalyticsPageView();

    expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_location: 'https://www.markstruck.com/?metric=population-2024',
      page_title: 'U.S. County Atlas',
    });
  });
});
