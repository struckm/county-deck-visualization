const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function isGoogleAnalyticsMeasurementId(
  measurementId: string | undefined,
) {
  return GA_MEASUREMENT_ID_PATTERN.test(measurementId?.trim().toUpperCase() ?? '');
}

export function initializeGoogleAnalytics(
  measurementId: string | undefined = import.meta.env.VITE_GA_MEASUREMENT_ID,
) {
  const normalizedId = measurementId?.trim().toUpperCase();
  if (!normalizedId || !isGoogleAnalyticsMeasurementId(normalizedId)) return false;
  if (document.querySelector('script[data-google-analytics]')) return true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  window.gtag('js', new Date());
  window.gtag('config', normalizedId);

  const script = document.createElement('script');
  script.async = true;
  script.dataset.googleAnalytics = normalizedId;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(normalizedId)}`;
  document.head.append(script);
  return true;
}

export function trackGoogleAnalyticsPageView() {
  window.gtag?.('event', 'page_view', {
    page_location: window.location.href,
    page_title: document.title,
  });
}
