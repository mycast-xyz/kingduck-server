import { prisma } from '../../utils/prisma';
import { ScrapedData } from '../core/ScraperBase';
import logger from '../../utils/logger';

export class DataSyncService {
  /**
   * 게임의 Element를 한 번에 선로딩한 뒤, 캐릭터 동기화 루프에서 캐릭터마다 find 쿼리를
   * 날리지 않고 element/path id를 해석하는 리졸버를 만든다(N+1 방지, B-H5).
   *
   * 캐시에 없으면 생성하고 캐시에 추가한다. 크롤은 (game,type)별로 직렬 실행이 보장되므로
   * in-memory 캐시로 충분하다(교차 실행 경쟁은 크롤러 중복실행 가드가 차단).
   * 완전한 중복 방지는 @@unique([gameId, name, type]) 제약이 필요(별도 마이그레이션).
   * 매칭은 기존과 동일하게 대소문자 무시.
   */
  private async createElementResolver(gameId: number) {
    const rows = await prisma.element.findMany({
      where: { gameId },
      select: { id: true, name: true, type: true },
    });
    const keyOf = (name: string, type: string) =>
      `${type}:${name.toLowerCase()}`;
    const cache = new Map<string, number>();
    for (const r of rows) cache.set(keyOf(r.name, r.type), r.id);

    return async (
      name: string | undefined | null,
      type: string,
      iconUrl?: string | null,
    ): Promise<number | null> => {
      if (!name) return null;
      const key = keyOf(name, type);
      const cached = cache.get(key);
      if (cached !== undefined) {
        // 스크래퍼가 아이콘을 주고 기존 행 아이콘이 비어있으면 채운다(서버 크롤로 속성 아이콘 적재).
        // 이미 값이 있으면(어드민 수동 설정 등) 덮지 않는다.
        if (iconUrl) {
          await prisma.element.updateMany({
            where: { id: cached, OR: [{ iconUrl: null }, { iconUrl: '' }] },
            data: { iconUrl },
          });
        }
        return cached;
      }

      const created = await prisma.element.create({
        data: { gameId, name, type, iconUrl: iconUrl || null },
      });
      cache.set(key, created.id);
      logger.info(`Created new ${type}: ${name}`);
      return created.id;
    };
  }

  /**
   * 게임의 캐릭터를 전부 비운다(소스 전환/클린 재구축용). 캐릭터의 videos(FK)를 먼저 지운 뒤 캐릭터 삭제.
   * Element(속성/특성) 행은 보존한다 — 같은 이름으로 재생성되며 admin이 설정한 아이콘/색/한글명이 유지됨.
   */
  public async purgeCharacters(gameSlug: string): Promise<number> {
    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) throw new Error(`Game not found: ${gameSlug}`);
    const chars = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { id: true },
    });
    const ids = chars.map((c) => c.id);
    if (ids.length === 0) return 0;
    await prisma.video.deleteMany({ where: { characterId: { in: ids } } });
    const del = await prisma.character.deleteMany({ where: { id: { in: ids } } });
    logger.warn(`Purged ${del.count} characters (+ their videos) for ${gameSlug}.`);
    return del.count;
  }

  /** 마지막 syncCharacters의 데이터 공백 요약. 스케줄러가 crawler_log.metadata에 기록 → 로그 상세 모달에 노출. */
  public lastSyncGaps: {
    gapCount: number;
    byKey: Record<string, number>;
    items: { name: string; originalId: string; missing: string[] }[];
  } | null = null;

  private static readonly GAMES_WITH_SKILLS = [
    'genshin',
    'starrail',
    'nikke',
    'wutheringwaves',
    'zzz',
  ];
  // wutheringwaves: BuildScraper가 syncCharacters를 쓰지 않아 detectGaps는 실제로 안 돌지만,
  // 데이터 공백 추적 대상임을 명시(향후 wuwa가 syncCharacters를 채택하면 즉시 반영). 기획안 요청.
  private static readonly GAMES_WITH_BUILD = [
    'genshin',
    'starrail',
    'zzz',
    'wutheringwaves',
  ];

  /**
   * 크롤 시점에 "기대되는 데이터가 비었는지" 감지 → 공백 키 배열(image/skills/recommendations).
   * 정상 공백(MC=여행자/개척자/방랑자)은 제외해 노이즈 방지. 채워지면 빈 배열이 되어 자동 해제.
   * → 신캐처럼 소스가 아직 안 채운 데이터를 "나중에 재크롤 필요"로 자동 표시.
   */
  private detectGaps(
    gameSlug: string,
    name: string,
    imageUrl: string | null | undefined,
    meta: Record<string, any>,
  ): string[] {
    const gaps: string[] = [];
    if (!imageUrl) gaps.push('image');
    if (DataSyncService.GAMES_WITH_SKILLS.includes(gameSlug)) {
      const skills = meta?.skills;
      if (!Array.isArray(skills) || skills.length === 0) gaps.push('skills');
    }
    const isMc = /개척자|여행자|방랑자|trailblazer|traveler/i.test(name || '');
    if (DataSyncService.GAMES_WITH_BUILD.includes(gameSlug) && !isMc) {
      const hasRec =
        (Array.isArray(meta?.recommendedWeapons) &&
          meta.recommendedWeapons.length > 0) ||
        (Array.isArray(meta?.lightcones) && meta.lightcones.length > 0) ||
        (Array.isArray(meta?.recommendedWEngines) &&
          meta.recommendedWEngines.length > 0);
      if (!hasRec) gaps.push('recommendations');
    }
    return gaps;
  }

  public async syncCharacters(gameSlug: string, data: ScrapedData[]) {
    logger.info(`Syncing ${data.length} characters for ${gameSlug}...`);

    // Validating game exists
    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) {
      logger.error(`Game ${gameSlug} not found!`);
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const gapItems: { name: string; originalId: string; missing: string[] }[] =
      [];

    // Element를 선로딩한 리졸버로 캐릭터마다의 find 쿼리(N+1)를 제거(B-H5).
    const resolveElement = await this.createElementResolver(game.id);

    // Upsert each character
    for (const item of data) {
      try {
        const originalId = item.metadata?.originalId;
        if (!originalId) {
          logger.warn(`Character ${item.name} has no originalId, skipping...`);
          continue;
        }

        // Resolve Element (DamageType) / Path (BaseType) — 캐시 우선
        const elementId = await resolveElement(
          item.metadata?.element,
          'DamageType',
          item.metadata?.elementIconUrl, // 스크래퍼가 주면 Element.iconUrl 적재(빈 경우만)
        );
        const pathId = await resolveElement(
          item.metadata?.path,
          'Path',
          item.metadata?.pathIconUrl,
        );

        // 인덱스 컬럼 기반 매칭(B-H4b). originalId는 위에서 non-null 확인됨.
        const existing = await prisma.character.findFirst({
          where: { gameId: game.id, originalId: String(originalId) },
        });

        if (existing) {
          // 빌드/추천 크롤(genshin/build, starrail/build 등)이 넣은 enrichment 키는
          // character 재크롤(이 키를 안 만듦)이 metadata를 통째 교체하며 덮어버리지 않도록 보존한다.
          // (서버에서 character가 build보다 나중에 돌면 추천이 사라지던 버그.)
          const existingMeta = (existing.metadata as Record<string, any>) || {};
          const newMeta = (item.metadata as Record<string, any>) || {};
          const PRESERVE_KEYS = [
            'recommendedWeapons',
            'recommendedArtifacts',
            'teams',
            'recommendedSource',
            'lightcones',
            'relics',
            'recommendedLightCones',
            'recommendedRelics',
            'recommendedEchoes',
            'echoSets',
            // zzz 추천(BuildScraper) — character 재크롤이 덮지 않도록 보존
            'recommendedWEngines',
            'driveDiscs',
            'recommendedStats',
          ];
          const merged: Record<string, any> = { ...newMeta };
          for (const k of PRESERVE_KEYS) {
            if (existingMeta[k] !== undefined && newMeta[k] === undefined) {
              merged[k] = existingMeta[k];
            }
          }

          // 데이터 공백 감지 → metadata.dataGaps(채워지면 빈 배열로 자동 해제) + 요약 누적.
          // imageUrl은 빌드 크롤처럼 이미지를 안 싣는 부분 크롤이 있으므로 기존 값으로 폴백(오탐 방지).
          merged.dataGaps = this.detectGaps(
            gameSlug,
            item.name,
            item.imageUrl ?? existing.imageUrl,
            merged,
          );
          if (merged.dataGaps.length)
            gapItems.push({
              name: item.name,
              originalId: String(originalId),
              missing: merged.dataGaps,
            });

          // Update existing character
          await prisma.character.update({
            where: { id: existing.id },
            data: {
              name: item.name,
              originalId: String(originalId), // 컬럼 동기화(B-H4b)
              rarity: item.rarity,
              // weaponType/role은 String 컬럼. 일부 게임(엔드필드)은 숫자 코드라 강제 변환(B-H4b 선행 시 노출).
              weaponType:
                item.weaponType != null ? String(item.weaponType) : null,
              role: item.role != null ? String(item.role) : null,
              description: item.description,
              imageUrl: item.imageUrl,
              elementId,
              pathId,
              metadata: merged,
              updatedAt: new Date(),
            },
          });
          logger.info(`Updated character: ${item.name} (ID: ${originalId})`);
        } else {
          // 데이터 공백 감지 → metadata.dataGaps + 요약 누적.
          const createMeta: Record<string, any> = {
            ...((item.metadata as Record<string, any>) || {}),
          };
          createMeta.dataGaps = this.detectGaps(
            gameSlug,
            item.name,
            item.imageUrl,
            createMeta,
          );
          if (createMeta.dataGaps.length)
            gapItems.push({
              name: item.name,
              originalId: String(originalId),
              missing: createMeta.dataGaps,
            });

          // Create new character
          await prisma.character.create({
            data: {
              gameId: game.id,
              name: item.name,
              originalId: String(originalId), // 컬럼 동기화(B-H4b)
              rarity: item.rarity,
              // weaponType/role은 String 컬럼. 일부 게임(엔드필드)은 숫자 코드라 강제 변환(B-H4b 선행 시 노출).
              weaponType:
                item.weaponType != null ? String(item.weaponType) : null,
              role: item.role != null ? String(item.role) : null,
              description: item.description,
              imageUrl: item.imageUrl,
              elementId,
              pathId,
              metadata: createMeta,
            },
          });
          logger.info(`Created character: ${item.name} (ID: ${originalId})`);
        }
        successCount++;
      } catch (err) {
        logger.error(`Failed to sync character ${item.name}:`, err);
        errorCount++;
      }
    }

    logger.info(
      `Sync complete for ${gameSlug}. Success: ${successCount}, Errors: ${errorCount}`,
    );

    // 데이터 공백 요약 — 스케줄러가 crawler_log.metadata에 기록(로그 상세 모달에 노출).
    const byKey: Record<string, number> = {};
    for (const g of gapItems)
      for (const k of g.missing) byKey[k] = (byKey[k] || 0) + 1;
    this.lastSyncGaps = {
      gapCount: gapItems.length,
      byKey,
      items: gapItems.slice(0, 100), // 과대 방지(상위 100)
    };
    if (gapItems.length)
      logger.warn(
        `[gap] ${gameSlug}: ${gapItems.length} chars need re-crawl later (${Object.entries(
          byKey,
        )
          .map(([k, v]) => `${k}:${v}`)
          .join(', ')})`,
      );
  }

  /**
   * Sync items (Lightcones, Relics, Materials etc)
   */
  public async syncItems(gameSlug: string, data: ScrapedData[]) {
    logger.info(`Syncing ${data.length} items for ${gameSlug}...`);

    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) {
      logger.error(`Game ${gameSlug} not found!`);
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const dataItem of data) {
      try {
        const originalId = dataItem.metadata?.originalId;
        if (!originalId) {
          logger.warn(`Item ${dataItem.name} has no originalId, skipping...`);
          continue;
        }

        // Item.type 컬럼은 String. 일부 게임(엔드필드)은 metadata.type이 숫자(예: 8)라
        // 그대로 넣으면 Prisma가 거부한다. 항상 문자열로 강제(0도 'Unknown'으로 오인 않도록 ??).
        const itemType = String(dataItem.metadata?.type ?? 'Unknown');
        const oidStr = String(originalId);

        // 인덱스 컬럼 기반 매칭 (gameId, type, originalId). originalId는 타입을 가로질러
        // 충돌하므로(예: starrail Material 101 vs RelicSet 101) type까지 포함해야 안전(B-H4b).
        const existing = await prisma.item.findFirst({
          where: { gameId: game.id, type: itemType, originalId: oidStr },
        });

        if (existing) {
          await prisma.item.update({
            where: { id: existing.id },
            data: {
              name: dataItem.name,
              type: itemType,
              originalId: oidStr, // 컬럼 동기화(B-H4b)
              rarity: dataItem.rarity || dataItem.metadata?.rarity,
              description:
                dataItem.description || dataItem.metadata?.description,
              imageUrl: dataItem.imageUrl,
              metadata: dataItem.metadata,
              updatedAt: new Date(),
            },
          });
          logger.info(
            `Updated item: [${itemType}] ${dataItem.name} (ID: ${originalId})`,
          );
        } else {
          await prisma.item.create({
            data: {
              gameId: game.id,
              name: dataItem.name,
              type: itemType,
              originalId: oidStr, // 컬럼 동기화(B-H4b)
              rarity: dataItem.rarity || dataItem.metadata?.rarity,
              description:
                dataItem.description || dataItem.metadata?.description,
              imageUrl: dataItem.imageUrl,
              metadata: dataItem.metadata,
            },
          });
          logger.info(
            `Created item: [${itemType}] ${dataItem.name} (ID: ${originalId})`,
          );
        }
        successCount++;
      } catch (err) {
        logger.error(`Failed to sync item ${dataItem.name}:`, err);
        errorCount++;
      }
    }

    logger.info(
      `Sync complete for ${gameSlug} items. Success: ${successCount}, Errors: ${errorCount}`,
    );
  }

  /**
   * Sync YouTube Shorts videos
   */
  public async syncVideos(gameSlug: string, data: ScrapedData[]) {
    logger.info(`Syncing ${data.length} videos for ${gameSlug}...`);

    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) {
      logger.error(`Game ${gameSlug} not found!`);
      return;
    }

    const YoutubeUtils = (await import('../../utils/youtubeUtils')).default;
    const path = await import('path');
    const fs = await import('fs');

    let successCount = 0;
    let errorCount = 0;

    for (const item of data) {
      try {
        const { title, url, thumbnailUrl, characterName, type } = item;
        logger.info(
          `Processing video: ${title} (Matched Character: ${characterName})`,
        );

        // Check if video already exists
        const existingVideo = await prisma.video.findUnique({
          where: { url },
        });

        // Check if video already exists with any valid extension
        const hasLocalFile =
          existingVideo &&
          existingVideo.localPath &&
          (existingVideo.localPath.endsWith('.webm') ||
            existingVideo.localPath.endsWith('.mp4'));

        if (existingVideo && hasLocalFile) {
          logger.debug(
            `Skipping video (already exists and downloaded): ${title}`,
          );
          continue;
        }

        // Find character
        let character = null;
        if (characterName) {
          character = await prisma.character.findFirst({
            where: {
              gameId: game.id,
              name: {
                contains: characterName,
                mode: 'insensitive',
              },
            },
          });
        }

        // Upsert video
        const video = await prisma.video.upsert({
          where: { url },
          create: {
            gameId: game.id,
            characterId: character?.id,
            title,
            url,
            thumbnailUrl,
            type: type || 'KeyVisual',
          },
          update: {
            title,
            thumbnailUrl,
            characterId: character?.id,
            type: type || 'KeyVisual',
          },
        });
        logger.info(
          `Upserted video: ID ${video.id}, Title: "${video.title}" (URL: ${url})`,
        );

        // Download video if no valid local file exists
        const currentFileExists =
          video.localPath &&
          (video.localPath.endsWith('.webm') ||
            video.localPath.endsWith('.mp4'));

        if (!currentFileExists) {
          const videoId = url.split('/').pop() || '';
          if (videoId) {
            try {
              const extension = await YoutubeUtils.downloadVideoById(videoId);
              if (extension) {
                const videoDir = path.join(__dirname, '../../../static/video/');
                const files = fs.readdirSync(videoDir);
                const downloadedFile = files.find(
                  (f: string) =>
                    f.startsWith(videoId) && f.endsWith(`.${extension}`),
                );

                if (downloadedFile) {
                  const localPath = `assets/video/${downloadedFile}`;
                  await prisma.video.update({
                    where: { id: video.id },
                    data: { localPath },
                  });
                  logger.info(
                    `Downloaded video (${extension}): ${downloadedFile}`,
                  );
                }
              } else {
                logger.warn(`Failed to download video: ${videoId}`);
              }
            } catch (downloadErr) {
              logger.error(
                `Error during download for video ${videoId}:`,
                downloadErr,
              );
              // Continue to next video even if download fails
            }
          }
        }

        successCount++;
      } catch (err) {
        logger.error(`Failed to sync video record for ${item.title}:`, err);
        errorCount++;
      }
    }

    logger.info(
      `Sync complete. Success: ${successCount}, Errors: ${errorCount}`,
    );
  }
}
