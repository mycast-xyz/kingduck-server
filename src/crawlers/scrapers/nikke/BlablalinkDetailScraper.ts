import { Browser } from '../../core/Browser';
import { prisma } from '../../../utils/prisma';
import logger from '../../../utils/logger';
import { ImageDownloader } from '../../utils/ImageDownloader';

/**
 * 니케 캐릭터 상세 enrichment 스크래퍼 — blablalink(SHIFT UP 공식 한국어).
 *
 * BlablalinkCharacterScraper가 만든 192캐릭(각 metadata.resourceId 보유)을 대상으로,
 * 캐릭터 상세 페이지(shiftyspad/nikke?nikke=<resourceId>)를 헤드리스로 렌더한다. 이 페이지는
 * Vite SPA라 해시 URL의 상세 JSON(sg-tools-cdn .json, body에 skill1_detail 포함)을 fetch하므로
 * **response 가로채기**로 캡처한다(DOM 파싱 불가).
 *
 * 추출 → 각 캐릭 metadata에 read-merge(기존 bl*·resourceId 보존, 아래 키 추가):
 *   - skills:   [{ name, type, description }] — 스킬1/스킬2/버스트. 프론트 NikkeSkillTreeViewModel이
 *               이 shape를 그대로 읽는다. description은 {description_value_NN} 플레이스홀더를
 *               레벨1 값으로 치환 + <color>/<word_group> 태그 제거(안쪽 텍스트만, \n 유지).
 *   - lore:     description_localkey(한국어 소개/스토리).
 *   - cv:       성우(cv_localkey_ko / cv_localkey_ja 결합, 폴백 cv_localkey).
 *   - costumes: [{ name, description, grade }] (이미지는 v1 생략).
 *   - stats:    { atkMax, defMax, hpMax, criticalRatio, criticalDamage } (레벨 리스트 만렙=마지막값).
 *   - squad:    스쿼드(소속) 키.
 *
 * DataSyncService를 거치지 않고 prisma.character.update로 직접 갱신한다(enrichment 전용).
 * 191개 렌더라 느리다 — limit으로 테스트 가능(인자 또는 env NIKKE_DETAIL_LIMIT).
 */
const DETAIL_URL = (resourceId: string | number) =>
  `https://www.blablalink.com/shiftyspad/nikke?from=list&nikke=${resourceId}&lang=ko`;

type SkillDetail = {
  name_localkey?: string;
  description_localkey?: string;
  description_value_list?: Array<{ description_value?: string[] }>;
};

/**
 * `{description_value_NN}` 플레이스홀더를 description_value_list의 값으로 치환한다.
 * NN(1-base) → list[NN-1].description_value[level-1] (description_value는 레벨1~10 배열).
 */
function resolvePlaceholders(
  desc: string,
  valueList: Array<{ description_value?: string[] }> = [],
  level = 1,
): string {
  return desc.replace(/\{description_value_(\d+)\}/g, (whole, nn: string) => {
    const idx = parseInt(nn, 10) - 1;
    const entry = valueList[idx];
    const v = entry?.description_value?.[level - 1];
    return v != null ? v : whole; // 못 찾으면 원문 유지
  });
}

/**
 * 인게임 마크업 정리: <color=#...>...</color> 와 <word_group=ID>text</word_group> 는
 * **태그만 제거하고 안쪽 텍스트는 남긴다**. \n은 유지(프론트가 개행→<br> 처리).
 */
function cleanMarkup(text: string): string {
  return text.replace(/<\/?(?:color|word_group)\b[^>]*>/g, '');
}

function buildSkill(detail: SkillDetail | undefined, type: string) {
  if (!detail) return null;
  const name = detail.name_localkey || '';
  let desc = detail.description_localkey || '';
  desc = resolvePlaceholders(desc, detail.description_value_list || [], 1);
  desc = cleanMarkup(desc);
  return { name, type, description: desc };
}

export class BlablalinkDetailScraper {
  /**
   * 니케 캐릭터 상세를 긁어 metadata에 병합한다.
   * @param limit 처리할 캐릭터 수 제한(테스트용). 미지정 시 env NIKKE_DETAIL_LIMIT, 그것도 없으면 전체.
   * @returns enrichment에 성공한 캐릭터 수.
   */
  async enrich(limit?: number): Promise<number> {
    const envLimit = process.env.NIKKE_DETAIL_LIMIT
      ? parseInt(process.env.NIKKE_DETAIL_LIMIT, 10)
      : undefined;
    const effLimit = limit ?? (Number.isFinite(envLimit) ? envLimit : undefined);

    const game = await prisma.game.findUnique({ where: { slug: 'nikke' } });
    if (!game) throw new Error('Game not found: nikke');

    let characters = await prisma.character.findMany({
      where: { gameId: game.id },
      select: { id: true, name: true, metadata: true },
      orderBy: { id: 'asc' },
    });
    if (effLimit && effLimit > 0) characters = characters.slice(0, effLimit);

    logger.info(
      `Nikke detail enrichment: ${characters.length} characters` +
        (effLimit ? ` (limited to ${effLimit})` : ' (full)'),
    );

    const browser = Browser.getInstance();
    await browser.init();

    let success = 0;
    let failed = 0;
    // 홈서버(4GB) 안정화: N개마다 브라우저 재시작(Chromium 메모리 반납), 연속 실패 누적 시 중단.
    let processed = 0;
    let consecFail = 0;
    const RESTART_EVERY = 40; // 40개 렌더마다 브라우저 재시작
    const MAX_CONSEC_FAIL = 20; // 연속 20회 실패면 소스 차단/다운으로 보고 중단

    for (const ch of characters) {
      // 연속 실패가 임계치를 넘으면(소스 차단/다운 추정) 더 갈수록 손해 → 중단.
      if (consecFail >= MAX_CONSEC_FAIL) {
        logger.error(
          `[nikke/detail] ${consecFail} consecutive failures — source likely blocking/down. Aborting (${success} enriched, ${failed} failed).`,
        );
        break;
      }

      const meta = (ch.metadata as Record<string, any>) || {};
      const resourceId = meta.resourceId;
      if (resourceId == null) {
        logger.warn(`[nikke/detail] ${ch.name} (#${ch.id}): no resourceId, skipping.`);
        failed++;
        continue;
      }

      // 메모리 반납: 일정 개수마다 브라우저 재시작(페이지 close만으론 Chromium 프로세스가 누적됨).
      if (processed > 0 && processed % RESTART_EVERY === 0) {
        await browser.close();
        await browser.init();
        logger.info(
          `[nikke/detail] browser restarted at ${processed} renders (memory release).`,
        );
      }
      processed++;

      const page = await browser.getPage();
      let captured: string | null = null;
      page.on('response', async (resp) => {
        if (captured) return;
        if (!/sg-tools-cdn.*\.json/.test(resp.url())) return;
        try {
          const t = await resp.text();
          if (/skill1_detail/.test(t)) captured = t;
        } catch {
          /* ignore */
        }
      });

      try {
        await page.goto(DETAIL_URL(resourceId), {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });
        await new Promise((r) => setTimeout(r, 5000));

        if (!captured) {
          logger.warn(
            `[nikke/detail] ${ch.name} (#${ch.id}, res=${resourceId}): detail JSON not captured.`,
          );
          failed++;
          consecFail++;
          continue;
        }

        let d: any = JSON.parse(captured);
        if (Array.isArray(d)) d = d[0];
        if (!d) {
          logger.warn(`[nikke/detail] ${ch.name} (#${ch.id}): empty detail JSON.`);
          failed++;
          continue;
        }

        // skills (스킬1 → 스킬2 → 버스트). NikkeSkillTreeViewModel이 [{name,type,description}]를 읽음.
        const skills = [
          buildSkill(d.skill1_detail, '스킬 1'),
          buildSkill(d.skill2_detail, '스킬 2'),
          buildSkill(d.ulti_skill_detail, '버스트 스킬'),
        ].filter((s): s is { name: string; type: string; description: string } => s != null);

        // lore
        const lore = cleanMarkup(d.description_localkey || '');

        // cv — 예: "CV : 이명호 / CV : 노토 마미코". '-'는 미설정 취급.
        const cvParts = [d.cv_localkey_ko, d.cv_localkey_ja].filter(
          (v: string) => v && v !== '-',
        );
        let cv = cvParts.join(' / ');
        if (!cv && d.cv_localkey && d.cv_localkey !== '-') cv = d.cv_localkey;

        // costumes — 캐릭터 아트 swiper의 img alt="{res}_{costumeId}_{idx}" → costumeId별 이미지 src.
        // (코스튬 JSON엔 이미지 URL이 없고, 해시 CDN 경로라 DOM에서 alt로 식별해 매핑한다.)
        const costumeImgMap: Record<string, string> = await page.evaluate(() => {
          const map: Record<string, string> = {};
          document.querySelectorAll('img').forEach((node) => {
            const im = node as HTMLImageElement;
            const m = (im.alt || '').match(/^\d+_(\d+)_\d+$/);
            if (m && /sg-tools-cdn/.test(im.src) && !map[m[1]]) map[m[1]] = im.src;
          });
          return map;
        });
        const costumes: Array<{
          name: string;
          desc: string;
          grade: string;
          image?: string;
        }> = [];
        for (const c of d.character_costume_list || []) {
          const imgUrl = costumeImgMap[String(c.id)];
          let image: string | null = null;
          if (imgUrl) {
            image = await ImageDownloader.downloadAndSave(
              imgUrl,
              'nikke',
              'costume',
              `costume_${resourceId}_${c.id}`,
            );
          }
          costumes.push({
            name: c.costume_name_locale || '',
            desc: c.costume_description_locale || '',
            grade: c.costume_grade_id || '',
            ...(image ? { image } : {}),
          });
        }

        // stats — 레벨 리스트의 마지막 값 = 만렙.
        const atk = d.character_level_attack_list || [];
        const def = d.character_level_defence_list || [];
        const hp = d.character_level_hp_list || [];
        const last = (a: any[]) => (Array.isArray(a) && a.length ? a[a.length - 1] : null);
        const stats = {
          atkMax: last(atk),
          defMax: last(def),
          hpMax: last(hp),
          criticalRatio: d.critical_ratio ?? null,
          criticalDamage: d.critical_damage ?? null,
        };

        const squad = d.squad ?? null;

        // read-merge: 기존 metadata(bl*·resourceId 등) 보존하고 상세 키만 추가.
        const newMeta = { ...meta, skills, lore, cv, costumes, stats, squad };
        await prisma.character.update({
          where: { id: ch.id },
          data: { metadata: newMeta },
        });

        success++;
        consecFail = 0; // 성공 → 연속 실패 카운터 리셋
        logger.info(
          `[nikke/detail] ${ch.name} (#${ch.id}): skills=${skills.length}, costumes=${costumes.length}, cv="${cv}".`,
        );
      } catch (e) {
        failed++;
        consecFail++;
        logger.error(
          `[nikke/detail] ${ch.name} (#${ch.id}, res=${resourceId}) failed:`,
          e instanceof Error ? e.message : e,
        );
      } finally {
        await page.close().catch(() => {});
      }
    }

    logger.info(`Nikke detail enrichment complete: ${success} ok, ${failed} failed.`);
    return success;
  }
}
