export interface ScrapedData {
  name: string;
  sourceUrl: string;
  [key: string]: any;
}

export abstract class ScraperBase {
  protected gameSlug: string;

  constructor(gameSlug: string) {
    this.gameSlug = gameSlug;
  }

  abstract scrape(): Promise<ScrapedData[]>;

  protected async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
