import { GenshinCharacterScraper } from './scrapers/genshin/character';
import { GenshinWeaponScraper } from './scrapers/genshin/weapon';
import { GenshinMaterialScraper } from './scrapers/genshin/material';
import { GenshinYoutubeShortsScraper } from './scrapers/genshin/YoutubeShortsScraper';
import { GenshinEventScraper } from './scrapers/genshin/EventScraper';
import { GenshinBuildScraper } from './scrapers/genshin/BuildScraper';
import { CharacterScraper as StarRailCharacterScraper } from './scrapers/starrail/CharacterScraper';
import { LightConeScraper as StarRailLightConeScraper } from './scrapers/starrail/LightConeScraper';
import { RelicScraper as StarRailRelicScraper } from './scrapers/starrail/RelicScraper';
import { StarRailItemScraper } from './scrapers/starrail/ItemScraper';
import { StarRailBuildScraper } from './scrapers/starrail/BuildScraper';
import { EventScraper as StarRailEventScraper } from './scrapers/starrail/EventScraper';
import { RedeemCodeScraper as StarRailRedeemCodeScraper } from './scrapers/starrail/RedeemCodeScraper';
import { YoutubeShortsScraper } from './scrapers/starrail/YoutubeShortsScraper';
import { YoutubeShortsScraper as Reverse1999YoutubeShortsScraper } from './scrapers/reverse1999/YoutubeShortsScraper';
import { Reverse1999CharacterScraper } from './scrapers/reverse1999/CharacterScraper';
import { WutheringWavesCharacterScraper } from './scrapers/wutheringwaves/CharacterScraper';
import { WutheringWavesWeaponScraper } from './scrapers/wutheringwaves/WeaponScraper';
import { WutheringWavesEchoScraper } from './scrapers/wutheringwaves/EchoScraper';
import { WutheringWavesItemScraper } from './scrapers/wutheringwaves/ItemScraper';
import { RedeemCodeScraper as WutheringWavesRedeemCodeScraper } from './scrapers/wutheringwaves/RedeemCodeScraper';
import { YoutubeShortsScraper as WutheringWavesYoutubeShortsScraper } from './scrapers/wutheringwaves/YoutubeShortsScraper';
import { EndfieldCharacterScraper } from './scrapers/endfield/CharacterScraper';
import { EndfieldWeaponScraper } from './scrapers/endfield/WeaponScraper';
import { EndfieldEquipmentScraper } from './scrapers/endfield/EquipmentScraper';
import { EndfieldItemScraper } from './scrapers/endfield/ItemScraper';
import { EndfieldYoutubeShortsScraper } from './scrapers/endfield/YoutubeShortsScraper';
import { EventScraper as EndfieldEventScraper } from './scrapers/endfield/EventScraper';
import { BlablalinkCharacterScraper } from './scrapers/nikke/BlablalinkCharacterScraper';
import { BlablalinkIconScraper } from './scrapers/nikke/BlablalinkIconScraper';
import { BlablalinkDetailScraper } from './scrapers/nikke/BlablalinkDetailScraper';
import { YoutubeShortsScraper as NikkeYoutubeShortsScraper } from './scrapers/nikke/YoutubeShortsScraper';
import { BlablalinkEventScraper } from './scrapers/nikke/EventScraper';
import { ZzzCharacterScraper } from './scrapers/zzz/CharacterScraper';
import { DataSyncService } from './services/DataSyncService';
import { Browser } from './core/Browser';
import logger from '../utils/logger';
import { prisma } from '../utils/prisma';
import { CrawlerStatus } from '@prisma/client';

// Type definition for scraper task
export type ScraperTask = {
  game: string;
  type: string; // 'character', 'item', 'weapon', 'echo', 'video', etc.
  run: (syncService: DataSyncService) => Promise<number>;
  // 동결(freeze) 플래그. 외부 데이터 소스 장애 등으로 일시 비활성한 태스크.
  // 스케줄러 루프와 수동 실행 모두 스킵하고, 기존 DB 데이터를 그대로 서빙한다.
  enabled?: boolean; // 미지정 시 활성(true)으로 간주
  disabledReason?: string; // enabled:false일 때 사유(로그/관리자 UI 노출용)
};

// Define all tasks
export const CRAWLER_TASKS: ScraperTask[] = [
  // --- Genshin Impact ---
  // 캐릭터: Ambr(gi.yatta.moe) 공개 API 소스. 기획: ../docs/CRAWLER_SOURCE_MIGRATION_PLAN.md (과제 3)
  {
    game: 'genshin',
    type: 'character',
    run: async (s) => {
      const scraper = new GenshinCharacterScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('genshin', data);
      return data.length;
    },
  },
  {
    game: 'genshin',
    type: 'weapon',
    run: async (s) => {
      const scraper = new GenshinWeaponScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncItems('genshin', data);
      return data.length;
    },
  },
  {
    game: 'genshin',
    type: 'item', // General materials
    run: async (s) => {
      const scraper = new GenshinMaterialScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncItems('genshin', data);
      return data.length;
    },
  },
  {
    game: 'genshin',
    type: 'event',
    run: async (s) => {
      const scraper = new GenshinEventScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'genshin',
    type: 'video',
    run: async (s) => {
      const scraper = new GenshinYoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('genshin', data);
      return data.length;
    },
  },
  {
    game: 'genshin',
    type: 'build', // 추천 무기(궁합) — genshin.gg 큐레이션
    run: async (s) => {
      const scraper = new GenshinBuildScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('genshin', data);
      return data.length;
    },
  },

  // --- Honkai: Star Rail ---
  // character / item(LightCone) / relic 3종은 hakush 소실 → starrailstation.com(PAGE_CONFIG)으로
  // 마이그레이션 완료(2026-06-17). 일반 item(general)은 SRS에 독립 재료 목록이 없어 **동결 유지**
  // (사용자 결정) — 기존 DB의 재료 데이터(약 1530건)는 그대로 서빙된다.
  // 기획/이력: ../docs/CRAWLER_SOURCE_MIGRATION_PLAN.md (과제 1)
  {
    game: 'starrail',
    type: 'character',
    run: async (s) => {
      const scraper = new StarRailCharacterScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('starrail', data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'item', // LightCone is technically an item
    run: async (s) => {
      const scraper = new StarRailLightConeScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncItems('starrail', data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'relic',
    run: async (s) => {
      const scraper = new StarRailRelicScraper();
      const data = await scraper.scrape();
      return data ? data.length : 0;
    },
  },
  {
    game: 'starrail',
    type: 'item', // General Items (Material/Usable/Mission/Virtual)
    enabled: false,
    disabledReason:
      'SRS에 독립 재료 목록 소스 없음 — 동결 유지(기존 DB 재료 서빙). hakush 소실 후속.',
    run: async (s) => {
      const scraper = new StarRailItemScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'event',
    run: async (s) => {
      const scraper = new StarRailEventScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'redeem',
    run: async (s) => {
      const { prisma } = require('../utils/prisma');
      const scraper = new StarRailRedeemCodeScraper(prisma);
      const result = await scraper.scrape();
      return result ? result.codes.length : 0;
    },
  },
  {
    game: 'starrail',
    type: 'video',
    run: async (s) => {
      const scraper = new YoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('starrail', data);
      return data.length;
    },
  },
  {
    game: 'starrail',
    type: 'build', // 추천 광추/유물(궁합) — genshin.gg/star-rail 큐레이션
    run: async (s) => {
      const scraper = new StarRailBuildScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('starrail', data);
      return data.length;
    },
  },

  // --- Reverse: 1999 ---
  {
    game: 'reverse1999',
    type: 'character',
    run: async (s) => {
      const scraper = new Reverse1999CharacterScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('reverse1999', data);
      return data.length;
    },
  },
  {
    game: 'reverse1999',
    type: 'video',
    run: async (s) => {
      const scraper = new Reverse1999YoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('reverse1999', data);
      return data.length;
    },
  },

  // --- Wuthering Waves ---
  {
    game: 'wutheringwaves',
    type: 'character',
    run: async (s) => {
      const scraper = new WutheringWavesCharacterScraper();
      const data = await scraper.scrape({});
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'weapon',
    run: async (s) => {
      const scraper = new WutheringWavesWeaponScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'echo',
    run: async (s) => {
      const scraper = new WutheringWavesEchoScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'item',
    run: async (s) => {
      const scraper = new WutheringWavesItemScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncItems('wutheringwaves', data);
      return data.length;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'redeem',
    run: async (s) => {
      const { prisma } = require('../utils/prisma');
      const scraper = new WutheringWavesRedeemCodeScraper(prisma);
      const result = await scraper.scrape();
      return result ? result.codes.length : 0;
    },
  },
  {
    game: 'wutheringwaves',
    type: 'video',
    run: async (s) => {
      const scraper = new WutheringWavesYoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('wutheringwaves', data);
      return data.length;
    },
  },

  // --- Arknights: Endfield ---
  {
    game: 'endfield',
    type: 'character',
    run: async (s) => {
      const scraper = new EndfieldCharacterScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('endfield', data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'weapon',
    run: async (s) => {
      const scraper = new EndfieldWeaponScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'equipment',
    run: async (s) => {
      const scraper = new EndfieldEquipmentScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'item',
    run: async (s) => {
      const scraper = new EndfieldItemScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncItems('endfield', data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'video',
    run: async (s) => {
      const scraper = new EndfieldYoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('endfield', data);
      return data.length;
    },
  },
  {
    game: 'endfield',
    type: 'event',
    run: async (s) => {
      const scraper = new EndfieldEventScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await scraper.save(data);
      return data.length;
    },
  },

  // --- 승리의 여신: NIKKE ---
  {
    game: 'nikke',
    type: 'character',
    // blablalink(공식 KR) 단일 소스로 클린 재구축. scrape가 150 미만이면 throw(교체 중단).
    run: async (s) => {
      const scraper = new BlablalinkCharacterScraper();
      const data = await scraper.scrape();
      await s.purgeCharacters('nikke'); // 기존 fandom 데이터 제거(videos+chars), Element 보존
      await s.syncCharacters('nikke', data);
      return data.length;
    },
  },
  {
    game: 'nikke',
    type: 'icon',
    // 속성 아이콘(코드/무기/클래스/제조사/버스트) 다운로드 + Element.iconUrl / game.attrIcons 연결.
    // blablalink 공개 정적 자산을 결정론적 URL로 받는다(렌더 불필요). 캐릭터 데이터는 건드리지 않음.
    run: async (s) => {
      const scraper = new BlablalinkIconScraper();
      return await scraper.syncIcons();
    },
  },
  {
    game: 'nikke',
    type: 'detail',
    // 캐릭터 상세 enrichment — blablalink 상세 페이지(per resourceId)를 렌더해 스킬/스토리/CV/
    // 코스튬/스탯을 캐릭터 metadata에 read-merge한다(기존 데이터 보존). 렌더가 191건이라 느림.
    // 테스트는 env NIKKE_DETAIL_LIMIT로 건수 제한 가능.
    run: async (s) => {
      const scraper = new BlablalinkDetailScraper();
      return await scraper.enrich();
    },
  },
  {
    game: 'nikke',
    type: 'video',
    run: async (s) => {
      const scraper = new NikkeYoutubeShortsScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncVideos('nikke', data);
      return data.length;
    },
  },
  {
    game: 'nikke',
    type: 'event',
    run: async () => {
      const scraper = new BlablalinkEventScraper();
      return await scraper.scrape();
    },
  },

  // --- 젠레스 존 제로(ZZZ) ---
  {
    game: 'zzz',
    type: 'character',
    run: async (s) => {
      const scraper = new ZzzCharacterScraper();
      const data = await scraper.scrape();
      if (data.length > 0) await s.syncCharacters('zzz', data);
      return data.length;
    },
  },
];

async function runCrawlers() {
  logger.info('=== Crawler Job Started ===');

  // Parse arguments
  const args = process.argv.slice(2);
  let gameFilter: string | null = null;
  let typeFilter: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--game' && args[i + 1]) {
      gameFilter = args[i + 1].toLowerCase();
      i++;
    }
    if (args[i] === '--type' && args[i + 1]) {
      typeFilter = args[i + 1].toLowerCase();
      i++;
    }
  }

  if (gameFilter) logger.info(`Filter: Game = ${gameFilter}`);
  if (typeFilter) logger.info(`Filter: Type = ${typeFilter}`);

  const browser = Browser.getInstance();
  await browser.init();

  // browser.close()를 try/finally로 감싸 크롤 도중 throw가 발생해도
  // Chromium 좀비 프로세스가 쌓이지 않도록 한다.
  try {
    const syncService = new DataSyncService();

    // Execute tasks
    let taskCount = 0;
    for (const task of CRAWLER_TASKS) {
      if (gameFilter && task.game !== gameFilter) continue;
      if (typeFilter && task.type !== typeFilter) continue;

      // 동결(freeze)된 태스크는 스킵 — 죽은 외부 소스로 인한 에러·로그 스팸 방지.
      if (task.enabled === false) {
        logger.warn(
          `>>> Skipping disabled task: [${task.game}] ${task.type}` +
            (task.disabledReason ? ` — ${task.disabledReason}` : ''),
        );
        continue;
      }

      logger.info(`>>> Running task: [${task.game}] ${task.type}`);
      try {
        // Find game ID for logging
        const game = await prisma.game.findUnique({
          where: { slug: task.game },
        });

        if (!game) {
          logger.error(`Game not found for task: ${task.game}`);
          continue;
        }

        // 중복 실행 방지 — 단, 오래된 RUNNING은 죽은 크롤(프로세스 중단으로 status가 RUNNING인 채
        // 남은 잔여물)로 보고 자동 정리한다. 안 그러면 한 번 죽은 크롤이 영원히 스킵된다.
        const STALE_RUNNING_MS = 60 * 60 * 1000; // 60분
        const existingRunning = await prisma.crawlerLog.findFirst({
          where: {
            gameId: game.id,
            crawlerType: task.type,
            status: CrawlerStatus.RUNNING,
          },
          orderBy: { startTime: 'desc' },
        });

        if (existingRunning) {
          const ageMs = Date.now() - new Date(existingRunning.startTime).getTime();
          if (ageMs < STALE_RUNNING_MS) {
            logger.warn(
              `Task [${task.game}] ${task.type} is already running (log ID: ${existingRunning.id}), skipping.`,
            );
            continue;
          }
          await prisma.crawlerLog.update({
            where: { id: existingRunning.id },
            data: {
              status: CrawlerStatus.FAILED,
              endTime: new Date(),
              errorMsg: `오래된 RUNNING 자동 정리(프로세스 중단 추정, ${Math.round(ageMs / 60000)}분)`,
            },
          });
          logger.warn(
            `Task [${task.game}] ${task.type}: stale RUNNING log #${existingRunning.id} cleared (${Math.round(ageMs / 60000)}m old).`,
          );
        }

        // Create log entry (RUNNING)
        const crawlerLog = await prisma.crawlerLog.create({
          data: {
            gameId: game.id,
            crawlerType: task.type,
            status: CrawlerStatus.RUNNING,
            startTime: new Date(),
          },
        });

        try {
          // 이 태스크의 데이터 공백 요약만 기록되도록 리셋(캐릭터 sync가 없는 태스크는 null 유지).
          syncService.lastSyncGaps = null;
          const itemsFound = await task.run(syncService);

          // Update log entry (SUCCESS) — 데이터 공백 요약을 metadata에 기록(로그 상세 모달 노출).
          await prisma.crawlerLog.update({
            where: { id: crawlerLog.id },
            data: {
              status: CrawlerStatus.SUCCESS,
              endTime: new Date(),
              itemsFound: itemsFound || 0,
              metadata: syncService.lastSyncGaps ?? undefined,
            },
          });

          taskCount++;
        } catch (innerError) {
          logger.error(`Task [${task.game}] ${task.type} failed:`, innerError);

          // Update log entry (FAILED)
          await prisma.crawlerLog.update({
            where: { id: crawlerLog.id },
            data: {
              status: CrawlerStatus.FAILED,
              endTime: new Date(),
              errorMsg:
                innerError instanceof Error
                  ? innerError.message
                  : String(innerError),
            },
          });
        }
      } catch (e) {
        logger.error(`Failed to handle log/task [${task.game}] ${task.type}:`, e);
      }
    }

    if (taskCount === 0) {
      logger.warn('No tasks matched the filters or checks.');
    }
  } finally {
    // 정상 종료든 예외든 반드시 브라우저를 닫는다.
    await browser.close();
    logger.info('=== Crawler Job Finished ===');
  }
}

// Allow running directly
if (require.main === module) {
  runCrawlers().catch((e) => {
    logger.error('Crawler Job Failed', e);
    logger.error('Crawler Job Failed:', e);
  });
}

export default runCrawlers;
