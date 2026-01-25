import puppeteer from 'puppeteer';
import fs from 'fs';

async function scrape() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  try {
    const id = '59'; // 이고르
    const url = `https://www.reverse1999-simulator.com/character/${id}`;
    await page.goto(url, { waitUntil: 'networkidle2' });

    const content = await page.content();
    fs.writeFileSync(`reverse1999_detail_${id}.html`, content);
    console.log(`Saved reverse1999_detail_${id}.html`);

    console.log('Clicking "캐릭터 가이드" tab...');
    await page.click('button:first-child'); // First button is usually the guide tab
    await new Promise((r) => setTimeout(r, 2000)); // Wait for content

    const skillData = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('h2, h3')).map(
        (h) => ({
          title: h.innerText,
          content: h.nextElementSibling?.innerText,
        }),
      );
      return {
        sections,
      };
    });

    console.log('Extracted Sections:', JSON.stringify(skillData, null, 2));
    fs.writeFileSync(
      `reverse1999_detail_${id}_skills.json`,
      JSON.stringify(skillData, null, 2),
    );

    const data = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.innerText;
      const images = Array.from(document.querySelectorAll('img')).map(
        (img) => ({
          alt: img.alt,
          src: img.src,
        }),
      );
      const texts = Array.from(document.querySelectorAll('div, span, p'))
        .map((el) => {
          // Try to find specific sections
          const text = el.innerText.trim();
          if (text.length > 0 && text.length < 100) return text;
          return null;
        })
        .filter(Boolean);

      return {
        h1,
        images,
        texts: Array.from(new Set(texts)), // Unique short texts
      };
    });

    console.log('Character Data:', JSON.stringify(data, null, 2));
    fs.writeFileSync(
      `reverse1999_detail_${id}_extended.json`,
      JSON.stringify(data, null, 2),
    );
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}

scrape();
