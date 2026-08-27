import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

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
