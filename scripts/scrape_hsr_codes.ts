import puppeteer from 'puppeteer';

const ARCA_URL = 'https://arca.live/b/hkstarrail/132589689?mode=best&p=1';

async function scrapeHSRCodes() {
  try {
    console.log(`Launching Puppeteer to fetch ${ARCA_URL}...`);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // Set a realistic User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    await page.goto(ARCA_URL, { waitUntil: 'networkidle2' });

    // Wait for the content to load
    await page.waitForSelector('div.fr-view.article-content table');

    const result = await page.evaluate(() => {
      const contentDiv = document.querySelector('div.fr-view.article-content');
      if (!contentDiv) return { title: '', period: '', codes: [] };

      const firstTable = contentDiv.querySelector('table');
      if (!firstTable) return { title: '', period: '', codes: [] };

      const rows = firstTable.querySelectorAll('tr');
      if (rows.length === 0) return { title: '', period: '', codes: [] };

      // Process first row for Title and Period
      // User says: First line is Title, underneath is Period.
      // We'll get the innerText of the first row and split by newline.
      const firstRowText = rows[0].innerText.trim();
      const lines = firstRowText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const title = lines.length > 0 ? lines[0] : '';
      const period = lines.length > 1 ? lines[1] : ''; // Just taking the second line as period for now

      const extractedCodes: string[] = [];

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell) => {
          const text = cell.innerText.trim();

          // Regex: Uppercase alphanumeric, 8-20 chars.
          const matches = text.match(/\b[A-Z0-9]{8,20}\b/g);
          if (matches) {
            matches.forEach((match) => {
              // Basic filtering inside the browser context
              if (
                [
                  'HTTPS',
                  'ARCA',
                  'BEST',
                  'MODE',
                  'LIVE',
                  'HTML',
                  'HTTP',
                  'FAREWELL',
                  'IFYOUAREREADINGTHIS',
                ].includes(match)
              )
                return;
              // Filter out numbers-only
              if (/^\d+$/.test(match)) return;
              // Filter out dates
              if (/^20\d{6}$/.test(match)) return;

              // Fix STARRAILGIFT typo if present (OCR artifact)
              if (match === 'OSTARRAILGIFT') {
                extractedCodes.push('STARRAILGIFT');
              } else {
                extractedCodes.push(match);
              }
            });
          }
        });
      });
      return {
        title,
        period,
        codes: [...new Set(extractedCodes)],
      };
    });

    console.log(JSON.stringify(result, null, 2));

    await browser.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

scrapeHSRCodes();
