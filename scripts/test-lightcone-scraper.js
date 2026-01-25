"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const LightConeScraper_1 = require("../src/crawlers/scrapers/starrail/LightConeScraper");
const Browser_1 = require("../src/crawlers/core/Browser");
const logger_1 = __importDefault(require("../src/utils/logger"));
async function testLightConeScraper() {
    logger_1.default.info('=== Testing LightCone Scraper ===');
    try {
        // Initialize browser (required for some scrapers)
        const browser = Browser_1.Browser.getInstance();
        await browser.init();
        // Create scraper instance
        const scraper = new LightConeScraper_1.LightConeScraper();
        // Run scraper (modify results directly to limit for test)
        const results = await scraper.scrape();
        const limitedResults = results.slice(0, 1);
        logger_1.default.info(`\nScraped ${results.length} lightcones total. Testing with first ${limitedResults.length}.`);
        if (limitedResults.length > 0) {
            // Save first lightcone to JSON
            const firstLightCone = limitedResults[0];
            const outputPath = 'lightcone_sample.json';
            fs_1.default.writeFileSync(outputPath, JSON.stringify(firstLightCone, null, 2), 'utf-8');
            logger_1.default.info(`\n✅ Saved first lightcone to: ${outputPath}`);
            logger_1.default.info(`\nFirst LightCone Preview:`);
            logger_1.default.info(`  Name: ${firstLightCone.name}`);
            logger_1.default.info(`  Original ID: ${firstLightCone.metadata?.originalId}`);
            logger_1.default.info(`  Rarity: ${firstLightCone.metadata?.rarity}`);
            logger_1.default.info(`  Path: ${firstLightCone.metadata?.path}`);
            logger_1.default.info(`  Icon URL: ${firstLightCone.imageUrl}`);
            logger_1.default.info(`  Card URL: ${firstLightCone.metadata?.cardImageUrl}`);
            // Also save all lightcone names for reference
            const allNames = results.map((lc, idx) => ({
                index: idx + 1,
                id: lc.metadata?.originalId,
                name: lc.name,
                rarity: lc.metadata?.rarity,
            }));
            fs_1.default.writeFileSync('lightcone_list.json', JSON.stringify(allNames, null, 2), 'utf-8');
            logger_1.default.info(`\n✅ Saved all lightcone names to: lightcone_list.json`);
        }
        else {
            logger_1.default.warn('No lightcones found!');
        }
        // Close browser
        await browser.close();
        logger_1.default.info('\n=== Test Complete ===');
    }
    catch (error) {
        logger_1.default.error('Test failed:', error);
        process.exit(1);
    }
}
testLightConeScraper();
