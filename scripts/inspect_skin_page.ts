import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const url = 'https://www.reverse1999-simulator.com/skin/64';

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle0' });

  const data = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.innerText;
    const allText = document.body.innerText;
    const tables = Array.from(document.querySelectorAll('table')).map(
      (t) => t.innerText,
    );
    const images = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.src,
      alt: img.alt,
    }));
    const divs = Array.from(document.querySelectorAll('div')).map((d) => ({
      className: d.className,
      text: d.innerText.substring(0, 50),
    }));

    return {
      h1,
      tables,
      images,
      divs: divs.slice(0, 20), // sample
    };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

main();
