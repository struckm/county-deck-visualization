import {describe, expect, it} from 'vitest';
import {buildCountyBriefHtml} from './CountyDetailOverlay';

describe('buildCountyBriefHtml', () => {
  it('builds a printable, source-linked county decision brief', () => {
    const report = buildCountyBriefHtml({
      countyName: 'Cook County, IL',
      metricLabel: 'Population <estimate>',
      metricValue: '5,000,000',
      waterArea: '300 sq mi',
      geoid: '17031',
      state: 'Illinois',
      profileTitle: 'Population profile',
      profileHtml: '<section><h4>Sex</h4></section>',
      sourceLabel: 'U.S. Census Bureau',
      sourceUrl: 'https://www.census.gov/',
    });

    expect(report).toContain('County Signal / Decision brief');
    expect(report).toContain('Cook County, IL');
    expect(report).toContain('Population &lt;estimate&gt;');
    expect(report).toContain('<h4>Sex</h4>');
    expect(report).toContain('https://www.census.gov/');
    expect(report).toContain('@media print');
  });
});
