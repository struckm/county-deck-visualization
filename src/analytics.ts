declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export type GoogleAnalyticsEventParameters = Record<
  string,
  string | number | boolean
>;

export function trackGoogleAnalyticsEvent(
  eventName: string,
  parameters: GoogleAnalyticsEventParameters = {},
) {
  window.gtag?.('event', eventName, parameters);
}

export function trackGoogleAnalyticsPageView() {
  trackGoogleAnalyticsEvent('page_view', {
    page_location: window.location.href,
    page_title: document.title,
  });
}
