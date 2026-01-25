"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const RelicScraper_1 = require("../src/crawlers/scrapers/starrail/RelicScraper");
const Browser_1 = require("../src/crawlers/core/Browser");
const logger_1 = __importDefault(require("../src/utils/logger"));
async function testRelicScraper() {
    logger_1.default.info('=== Testing Relic Scraper ===');
    try {
        const browser = Browser_1.Browser.getInstance();
        await browser.init();
        const scraper = new RelicScraper_1.RelicScraper();
        const results = await scraper.scrape();
        logger_1.default.info(`\nScraped ${results.length} relic sets total.`);
        if (results.length > 0) {
            const firstRelic = results[0];
            const outputPath = 'relic_sample.json';
            fs_1.default.writeFileSync(outputPath, JSON.stringify(firstRelic, null, 2), 'utf-8');
            logger_1.default.info(`\n✅ Saved first relic set to: ${outputPath}`);
            logger_1.default.info(`\nFirst Relic Preview:`);
            logger_1.default.info(`  Name: ${firstRelic.name}`);
            logger_1.default.info(`  Original ID: ${firstRelic.metadata?.originalId}`);
            logger_1.default.info(`  2pc: ${firstRelic.metadata?.['2pc']}`);
            logger_1.default.info(`  4pc: ${firstRelic.metadata?.['4pc']}`);
            logger_1.default.info(`  Icon URL: ${firstRelic.imageUrl}`);
            const allNames = results.map((r, idx) => ({
                index: idx + 1,
                id: r.metadata?.originalId,
                name: r.name,
            }));
            fs_1.default.writeFileSync('relic_list.json', JSON.stringify(allNames, null, 2), 'utf-8');
            logger_1.default.info(`\n✅ Saved all relic set names to: relic_list.json`);
        }
        else {
            logger_1.default.warn('No relics found!');
        }
        await browser.close();
        logger_1.default.info('\n=== Test Complete ===');
    }
    catch (error) {
        logger_1.default.error('Test failed:', error);
        process.exit(1);
    }
}
testRelicScraper();
