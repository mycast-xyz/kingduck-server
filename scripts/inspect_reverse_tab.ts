import puppeteer from 'puppeteer';
import fs from 'fs';

async function inspectTab() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://www.reverse1999-simulator.com/character/31', {
      waitUntil: 'networkidle2',
    });

    // Click Resonance & Psychube tab
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.innerText.includes('공명 & 의지'));
      if (btn) btn.click();
    });

    await new Promise((r) => setTimeout(r, 2000));

    const html = await page.evaluate(() => document.body.innerHTML);
    fs.writeFileSync('reverse1999_tab_dump.html', html);
    console.log('Saved dump to reverse1999_tab_dump.html');
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}

inspectTab();
