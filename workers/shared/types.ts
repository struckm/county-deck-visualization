export interface AnalyticsRow {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

export interface AnalyticsSection {
  title: string;
  rows: AnalyticsRow[];
  warning?: string;
}

export interface DailyAnalyticsData {
  propertyId: string;
  reportDate: string;
  generatedAt: string;
  sections: AnalyticsSection[];
}

export interface EmailReport {
  subject: string;
  html: string;
  text: string;
}

