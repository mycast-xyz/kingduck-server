import { EventScraper } from '../src/crawlers/scrapers/endfield/EventScraper';
import fs from 'fs';
import path from 'path';

async function previewEndfieldEvents() {
  console.log('Starting Endfield event scraper preview...');

  const scraper = new EventScraper();
  const data = await scraper.scrape();

  console.log(`\nScraped ${data.length} events:`);
  data.forEach((event, index) => {
    console.log(`\n${index + 1}. ${event.name}`);
    console.log(`   URL: ${event.sourceUrl}`);
    console.log(`   Type: ${event.metadata.type}`);
  });

  // Save to database
  console.log('\n--- Saving to database ---');
  await scraper.save(data);

  // Also save preview file for reference
  const outputPath = path.join(
    process.cwd(),
    'data',
    'crawlers',
    'endfield',
    'events_preview.json',
  );

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\nPreview JSON saved to: ${outputPath}`);
}

previewEndfieldEvents().catch((error) => {
  console.error('Full error:', error);
  console.error('Error stack:', error.stack);
});
