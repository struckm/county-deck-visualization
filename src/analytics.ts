declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackGoogleAnalyticsPageView() {
  window.gtag?.('event', 'page_view', {
    page_location: window.location.href,
    page_title: document.title,
  });
}
