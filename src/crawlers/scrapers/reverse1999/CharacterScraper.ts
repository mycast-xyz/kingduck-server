import puppeteer from 'puppeteer';
import { ScraperBase, ScrapedData } from '../../core/ScraperBase';
import { ImageDownloader } from '../../utils/ImageDownloader';
import logger from '../../../utils/logger';

export class Reverse1999CharacterScraper extends ScraperBase {
  private readonly BASE_URL = 'https://www.reverse1999-simulator.com';

  constructor() {
    super('reverse1999');
  }

  // Helper methods for structured parsing
  private parseEfficiency(content: string) {
    const lines = content.split('\n');
    const table: { level: string; value: string }[] = [];
    const summary: string[] = [];
    const regex = /(\d)형상\t([\d.]+%)/;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        table.push({ level: match[1], value: match[2] });
      } else {
        if (line.trim()) summary.push(line.trim());
      }
    }
    return { summary: summary.join('\n'), table };
  }

  private parseBuilds(sections: any[]) {
    const build: any = { resonance: [], psychubes: [] };

    const resonanceSec = sections.find((s) => s.title === '공명 변조');
    if (resonanceSec) {
      const lines = resonanceSec.content
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l);
      for (let i = 0; i < lines.length; i += 2) {
        if (lines[i] && lines[i + 1]) {
          build.resonance.push({ priority: lines[i], name: lines[i + 1] });
        }
      }
    }

    const cubeSec = sections.find((s) => s.title === '의지 추천');
    if (cubeSec) {
      const raw = cubeSec.content;
      const parts = raw.split(/(\d\s*순위)/).filter((p: string) => p.trim());
      for (let i = 0; i < parts.length; i += 2) {
        const rank = parts[i]?.trim();
        const details = parts[i + 1]
          ?.trim()
          .split('\n')
          .map((s: string) => s.trim())
          .filter(Boolean);
        if (rank && details) {
          build.psychubes.push({ rank, details });
        }
      }
    }
    return build;
  }

  private parseTeams(sections: any[]) {
    const teams: any[] = [];
    const teamSections = sections.filter(
      (s) => s.title.includes('덱') || s.title.includes('조합'),
    );

    for (const sec of teamSections) {
      if (sec.title === '사용 조합 목록') continue;

      const members = sec.links.map((link: any) => ({
        role_info: link.text.split('\n'),
        originalId: link.href.split('/').pop(),
      }));

      teams.push({
        name: sec.title,
        members,
        raw_content: sec.content,
      });
    }
    return teams;
  }

  async scrape(options?: {
    limit?: number;
    specificId?: string;
  }): Promise<ScrapedData[]> {
    logger.info('Starting Reverse: 1999 Character scraping...');
    const results: ScrapedData[] = [];

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      // Set global timeout
      page.setDefaultNavigationTimeout(120000);
      page.setDefaultTimeout(120000);

      let targets: string[] = [];
      if (options?.specificId) {
        targets = [options.specificId];
        logger.info(`Targeting specific character ID: ${options.specificId}`);
      } else {
        // 1. Get Character List
        logger.info('Fetching character list...');
        await page.goto(`${this.BASE_URL}/character`, {
          waitUntil: 'networkidle0',
          timeout: 120000,
        });

        // Additional wait for dynamic content to render
        await new Promise((r) => setTimeout(r, 3000));

        const charIds = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a'))
            .map((a) => a.href)
            .filter((href) => href.includes('/character/'))
            .map((href) => href.split('/').pop())
            .filter((id): id is string => !!id && !isNaN(Number(id)));
        });

        const uniqueIds = Array.from(new Set(charIds));
        logger.info(`Found ${uniqueIds.length} characters.`);

        targets = uniqueIds;
        if (options?.limit) {
          targets = uniqueIds.slice(0, options.limit);
        }
      }

      for (const id of targets) {
        try {
          logger.info(`Processing character ${id}...`);
          const detailUrl = `${this.BASE_URL}/character/${id}`;

          try {
            await page.goto(detailUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 60000,
            });
          } catch (navErr) {
            logger.warn(
              `Navigation might have timed out for ${id}, attempting to proceed anyway...`,
            );
          }

          // Extract basic info from Next.js internal data
          const nextData = await page.evaluate(() => {
            try {
              // @ts-ignore
              if (window && window.__next_f) {
                // @ts-ignore
                const chunks = window.__next_f;
                for (const chunk of chunks) {
                  if (Array.isArray(chunk) && typeof chunk[1] === 'string') {
                    const content = chunk[1];
                    // Look for character data pattern
                    if (content.includes('"character":{')) {
                      const match = content.match(/"character":({.*?})/);
                      if (match) {
                        return JSON.parse(match[1]);
                      }
                    }
                  }
                }
              }
            } catch (e) {
              return null;
            }
            return null;
          });

          // Fallback DOM extraction
          const domData = await page.evaluate(() => {
            const h1 = document.querySelector('h1')?.innerText;
            const elementImg = document.querySelector(
              'img[src*="inspiration"]',
            );

            return {
              name: h1,
              afflatus: elementImg
                ? (elementImg as HTMLImageElement).alt
                : 'unknown',
            };
          });

          const name = nextData?.name || domData.name || `ReverseChar_${id}`;
          const rarity = nextData?.rarity || 5;
          const afflatus = nextData?.inspiration || domData.afflatus;
          const engName = nextData?.engName || id;

          // Image URLs
          const starPrefix = rarity === 6 ? '6stars' : '5stars';
          const iconRemoteUrl = `${this.BASE_URL}/characters/${starPrefix}_small/${engName}.webp`;
          const splashRemoteUrl = `${this.BASE_URL}/characters/${starPrefix}/${engName}.webp`;

          let localIconUrl = '';
          let localSplashUrl = '';

          try {
            const savedIcon = await ImageDownloader.downloadAndSave(
              iconRemoteUrl,
              'reverse1999',
              'character',
              `icon_${id}_${engName}`,
            );
            if (savedIcon) localIconUrl = savedIcon;
          } catch (e) {
            logger.warn(`Failed to download icon for ${name}: ${e}`);
          }

          try {
            const savedSplash = await ImageDownloader.downloadAndSave(
              splashRemoteUrl,
              'reverse1999',
              'character',
              `splash_${id}_${engName}`,
            );
            if (savedSplash) localSplashUrl = savedSplash;
          } catch (e) {
            logger.warn(`Failed to download splash for ${name}: ${e}`);
          }

          // Scrape Tabs data
          const tabs = ['캐릭터 가이드', '공명 & 의지'];
          let allSections: any[] = [];
          let skinLinks: string[] = [];

          // Blocklist for sections
          const blockedTitles = [
            '알림 받기',
            '육성 재화 계산기',
            '현재 상태',
            '목표 상태',
            '스킨 정보',
            '🌟 6성',
            '⭐ 5성',
            '★ 6성',
            '★ 5성',
            '가이드 영상',
          ];

          for (const tabName of tabs) {
            try {
              // Click the tab using evaluate to ensure React event handlers fire
              const clicked = await page.evaluate((name) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find((b) => b.innerText.includes(name));
                if (btn) {
                  btn.click();
                  return true;
                }
                return false;
              }, tabName);

              if (clicked) {
                logger.info(`Clicked tab: ${tabName}, waiting for content...`);
                await new Promise((r) => setTimeout(r, 2000)); // Increased wait time

                const tabResult = await page.evaluate((currentTab) => {
                  const extracted: any[] = [];
                  const foundSkinLinks: string[] = [];

                  const headings = document.querySelectorAll('h2, h3');
                  headings.forEach((h) => {
                    const title = (h as HTMLElement).innerText?.trim();
                    if (!title) return;
                    logger.info(`[DEBUG] Scraped Section Title: "${title}"`);

                    let content = '';
                    let images: string[] = [];
                    let links: { text: string; href: string }[] = [];

                    let sibling = h.nextElementSibling;
                    while (sibling && !sibling.tagName.match(/^H[1-6]$/)) {
                      const el = sibling as HTMLElement;
                      content += el.innerText + '\n';

                      // Extract images
                      const imgs = Array.from(el.querySelectorAll('img'));
                      imgs.forEach((img) => {
                        if (img.src) images.push(img.src);
                      });

                      // Extract links
                      const anchors = Array.from(el.querySelectorAll('a'));
                      anchors.forEach((a) => {
                        if (a.href) {
                          links.push({
                            text: a.innerText,
                            href: a.href,
                          });
                          if (a.href.includes('/skin/')) {
                            foundSkinLinks.push(a.href);
                          }
                        }
                      });

                      sibling = sibling.nextElementSibling;
                    }

                    extracted.push({
                      tab: currentTab,
                      title,
                      content: content.trim(),
                      images,
                      links,
                    });
                  });
                  return { extracted, foundSkinLinks };
                }, tabName);

                // Filter blocklisted sections
                const filtered = tabResult.extracted.filter((s: any) => {
                  if (blockedTitles.includes(s.title)) return false;
                  return true;
                });

                allSections = [...allSections, ...filtered];
                skinLinks = [...skinLinks, ...tabResult.foundSkinLinks];
              }
            } catch (e) {
              logger.warn(`Failed to scrape tab ${tabName} for ${name}: ${e}`);
            }
          }

          // Handle Skin Links & Deep Scraping
          const skins: any[] = [];

          if (skinLinks.length > 0) {
            const uniqueSkinLinks = Array.from(new Set(skinLinks));
            logger.info(
              `Found ${uniqueSkinLinks.length} skin links for ${name}. Processing...`,
            );

            for (const link of uniqueSkinLinks) {
              try {
                await page.goto(link, { waitUntil: 'networkidle2' });

                const skinData = await page.evaluate(() => {
                  const images = Array.from(document.querySelectorAll('img'));
                  const largeImages = images.filter(
                    (img) => img.width > 200 && img.height > 200,
                  );
                  // Prefer 'illust' or 'skin' in src
                  const mainImg =
                    largeImages.find(
                      (img) =>
                        img.src.includes('illust') || img.src.includes('skin'),
                    ) || largeImages[0];

                  // Extract text metadata
                  // Assuming standard structure: Name followed by Version, Rarity, Acquire
                  const bodyText = document.body.innerText;
                  const lines = bodyText
                    .split('\n')
                    .map((l) => l.trim())
                    .filter((l) => l);

                  const versionLine = lines.find(
                    (l) => l.includes('버전:') || l.includes('Version:'),
                  );
                  const rarityLine = lines.find(
                    (l) => l.includes('희귀도:') || l.includes('Rarity:'),
                  );
                  const acquireLine = lines.find(
                    (l) => l.includes('획득처:') || l.includes('Acquire:'),
                  );
                  const priceLine = lines.find(
                    (l) =>
                      l.includes('가격:') ||
                      l.includes('Price:') ||
                      l.includes('Cost:'),
                  );

                  const finalName =
                    document.querySelector('h1')?.innerText || '';

                  return {
                    name: finalName,
                    imageUrl: mainImg ? mainImg.src : null,
                    version: versionLine
                      ? versionLine.split(':')[1].trim()
                      : undefined,
                    type: rarityLine
                      ? rarityLine.split(':')[1].trim()
                      : undefined,
                    acquire: acquireLine
                      ? acquireLine.split(':')[1].trim()
                      : undefined,
                    price: priceLine
                      ? priceLine.split(':')[1].trim()
                      : undefined,
                  };
                });

                if (skinData.imageUrl) {
                  const skinId = skinData.name
                    .replace(/[^a-zA-Z0-9]/g, '_')
                    .toLowerCase();
                  let localSkinUrl = '';

                  try {
                    const savedSkin = await ImageDownloader.downloadAndSave(
                      skinData.imageUrl,
                      'reverse1999',
                      'skins',
                      `skin_${id}_${skinId}`,
                    );
                    if (savedSkin) localSkinUrl = savedSkin;
                  } catch (e) {
                    logger.warn(
                      `Failed to download skin image for ${skinData.name}: ${e}`,
                    );
                  }

                  skins.push({
                    name: skinData.name,
                    imageUrl: localSkinUrl || skinData.imageUrl, // Fallback to remote if fail
                    // sourceUrl removed as requested
                    metadata: {
                      version: skinData.version,
                      type: skinData.type,
                      acquire: skinData.acquire,
                      price: skinData.price,
                    },
                  });
                }
              } catch (e) {
                logger.warn(`Failed to scrape skin ${link}: ${e}`);
              }
            }
          }

          // Second Pass Filtering: Remove sections that are actually Skin Sections
          allSections = allSections.filter((s) => {
            // Check if title is in skin names
            const isSkinSection = skins.some((skin) => {
              const skinCleanName = skin.name.split('-')[0].trim();
              return (
                s.title.includes(skinCleanName) ||
                (skin.metadata.type === 'Insight' && s.title.includes('2통찰'))
              );
            });
            if (isSkinSection) {
              logger.info(`Filtering out skin section: ${s.title}`);
            } else if (s.title === '광상 정보') {
              logger.info(`Found Euphoria section!`);
            }
            return !isSkinSection;
          });

          // Structured Parsing for Final Result
          const profileSec = allSections.find((s) => s.title === '간단 소개');
          const profileTags = profileSec
            ? profileSec.content.split('\n').filter(Boolean)
            : [];

          const efficiencySec = allSections.find(
            (s) => s.title === '형상 효율 정리',
          );
          const efficiency = efficiencySec
            ? this.parseEfficiency(efficiencySec.content)
            : null;

          const builds = this.parseBuilds(allSections);
          const teams = this.parseTeams(allSections);

          // Deep Scrape Euphoria Info
          let euphoriaInfo: any = null;
          const euphoriaSection = allSections.find(
            (s) => s.title === '광상 정보',
          );
          if (euphoriaSection) {
            const euphoriaLink = euphoriaSection.links[0]?.href;
            let effectText = '';
            let euphoriaName = '';

            if (euphoriaLink) {
              try {
                await page.goto(euphoriaLink, {
                  waitUntil: 'domcontentloaded',
                  timeout: 60000,
                });
                const deepData = await page.evaluate(() => {
                  const title =
                    document.querySelector('h1')?.innerText?.trim() || '';

                  const bodyText = document.body.innerText;
                  const lines = bodyText
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean);

                  // Look for line containing '효과'
                  const effectIndex = lines.findIndex((l) =>
                    l.includes('효과'),
                  );

                  let effect = '';
                  if (effectIndex !== -1) {
                    const line = lines[effectIndex];
                    // Case 1: "효과 : blah blah" -> Extract "blah blah"
                    const parts = line.split(/효과\s*[:]?\s*/);
                    if (parts[1] && parts[1].trim().length > 0) {
                      effect = parts[1].trim();
                    } else if (effectIndex + 1 < lines.length) {
                      // Case 2: "효과" is header, content is next line
                      effect = lines[effectIndex + 1];
                    }
                  }

                  return { name: title, effect };
                });

                effectText = deepData.effect;
                if (deepData.name) {
                  euphoriaName = deepData.name;
                }
              } catch (e) {
                logger.warn(
                  `Failed to scrape euphoria link ${euphoriaLink}: ${e}`,
                );
              }
            }

            // --- Image Download Logic Added ---
            let euphoriaLocalUrl = '';
            const euphoriaRemoteUrl = euphoriaSection.images[0];

            if (euphoriaRemoteUrl) {
              try {
                const savedEuphoria = await ImageDownloader.downloadAndSave(
                  euphoriaRemoteUrl,
                  'reverse1999',
                  'euphoria',
                  `euphoria_${id}_${engName}`, // e.g. euphoria_31_mercuria
                );
                if (savedEuphoria) euphoriaLocalUrl = savedEuphoria;
              } catch (e) {
                logger.warn(
                  `Failed to download euphoria image for ${name}: ${e}`,
                );
              }
            }
            // ----------------------------------

            euphoriaInfo = {
              name: euphoriaName || euphoriaSection.links[0]?.text || null,
              imageUrl: euphoriaLocalUrl || euphoriaRemoteUrl || null, // Priority: Local > Remote
              linkUrl: euphoriaLink || null,
              effect: effectText,
            };
          }

          results.push({
            name: name,
            sourceUrl: detailUrl,
            imageUrl: localSplashUrl,
            rarity: rarity,
            role: nextData?.role || 'damage',
            metadata: {
              originalId: id, // Critical requirement from user
              engName: engName,
              afflatus: afflatus,
              element: afflatus,
              path: nextData?.role || 'damage', // Using role as Path (DamageType in user's terms)
              iconImageUrl: localIconUrl,
              profile: { tags: profileTags },
              efficiency,
              euphoria_info: euphoriaInfo,
              builds,
              teams,
              skins: skins,
            },
          });
        } catch (err) {
          logger.error(`Failed to scrape character ${id}:`, err);
        }
      }
    } catch (e) {
      logger.error('Error in Reverse: 1999 scraper:', e);
    } finally {
      await browser.close();
    }

    return results;
  }
}
