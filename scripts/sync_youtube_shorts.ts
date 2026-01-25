import { prisma } from '../src/utils/prisma';
import { YoutubeShortsScraper } from '../src/crawlers/scrapers/starrail/YoutubeShortsScraper';
import YoutubeUtils from '../src/utils/youtubeUtils';
import logger from '../src/utils/logger';
import fs from 'fs';
import path from 'path';

async function syncYoutubeShorts() {
  logger.info('Starting YouTube Shorts sync...');

  try {
    // Get game ID for Star Rail
    const game = await prisma.game.findUnique({
      where: { slug: 'starrail' },
    });

    if (!game) {
      logger.error('Star Rail game not found in database');
      return;
    }

    // Run scraper
    const scraper = new YoutubeShortsScraper();
    const videos = await scraper.scrape();

    logger.info(`Scraped ${videos.length} videos`);

    let matchedCount = 0;
    let unmatchedCount = 0;
    let videosSaved = 0;

    for (const video of videos) {
      try {
        const { title, url, thumbnailUrl, characterName, type } = video;

        // Try to find character by name
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

          if (!character) {
            logger.warn(`No character found for name: ${characterName}`);
            unmatchedCount++;
          } else {
            logger.info(
              `Matched character: ${character.name} for ${characterName}`,
            );
            matchedCount++;

            // Update character metadata with keyVisualUrl
            const currentMetadata = (character.metadata as any) || {};
            await prisma.character.update({
              where: { id: character.id },
              data: {
                metadata: {
                  ...currentMetadata,
                  keyVisualUrl: url,
                },
              },
            });
          }
        } else {
          logger.warn(`Could not parse character name from title: ${title}`);
          unmatchedCount++;
        }

        // Upsert video to database
        await prisma.video.upsert({
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

        videosSaved++;
        logger.info(`Saved video: ${title}`);

        // Download video to webm
        try {
          // Extract video ID from URL (e.g., https://www.youtube.com/shorts/9Z9twPFh9iU)
          const videoId = url.split('/').pop() || '';
          if (videoId) {
            logger.info(`Downloading video: ${videoId}`);
            const downloadSuccess =
              await YoutubeUtils.downloadVideoById(videoId);
            if (downloadSuccess) {
              // Find the actual downloaded file
              const videoDir = path.join(__dirname, '../static/video/');
              const files = fs.readdirSync(videoDir);
              const downloadedFile = files.find((f) => f.startsWith(videoId));

              if (downloadedFile) {
                const localPath = `assets/video/${downloadedFile}`;
                await prisma.video.update({
                  where: { url },
                  data: { localPath },
                });
                logger.info(
                  `Downloaded video: ${downloadedFile} -> ${localPath}`,
                );
              }
            } else {
              logger.warn(`Failed to download video: ${videoId}`);
            }
          }
        } catch (downloadErr) {
          logger.error(`Error downloading video:`, downloadErr);
        }
      } catch (err) {
        logger.error(`Failed to process video ${video.title}:`, err);
      }
    }

    logger.info('YouTube Shorts sync complete');
    logger.info(
      `Matched: ${matchedCount}, Unmatched: ${unmatchedCount}, Videos saved: ${videosSaved}`,
    );
  } catch (e) {
    logger.error('YouTube Shorts sync failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

syncYoutubeShorts();
