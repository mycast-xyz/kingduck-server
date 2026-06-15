import YoutubeUtils from '../../utils/youtubeUtils';
import { prisma } from '../../utils/prisma';

export class VideoController {
  // 유튜브 크롤링 후 영상 다운로드 처리 구현
  // 파이썬 3.7 이상 / youtube-dl / ffmpeg 설치 필요
  // 참조 : https://github.com/microlinkhq/youtube-dl-exec
  async getYoutubeVideo(req: any, res: any): Promise<void> {
    try {
      const { characterId, youtubeVideoId } = req.params;

      if (!characterId || !youtubeVideoId) {
        return res.status(400).json({
          resultCode: 400,
          error: '캐릭터 ID와 YouTube 동영상 ID가 필요합니다.',
        });
      }

      // YouTube 동영상 ID 유효성 검사
      const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
      if (!youtubeIdRegex.test(youtubeVideoId)) {
        return res.status(400).json({
          resultCode: 400,
          error: '유효하지 않은 YouTube 동영상 ID입니다.',
        });
      }

      // 캐릭터 존재 여부 확인 (Video.gameId 확보 목적)
      const character = await prisma.character.findUnique({
        where: { id: Number(characterId) },
      });
      if (!character) {
        return res.status(404).json({
          resultCode: 404,
          error: '캐릭터를 찾을 수 없습니다.',
        });
      }

      const characterYoutube =
        await YoutubeUtils.downloadVideoById(youtubeVideoId);
      if (!characterYoutube) {
        return res.status(400).json({
          resultCode: 400,
          error: '동영상 다운로드에 실패했습니다.',
        });
      }

      // 다운로드 기록을 Video 테이블에 저장. url이 유니크이므로 재요청 시 갱신(upsert).
      await prisma.video.upsert({
        where: { url: youtubeVideoId },
        update: { localPath: 'assets/video/' + youtubeVideoId },
        create: {
          gameId: character.gameId,
          characterId: Number(characterId),
          title: youtubeVideoId,
          url: youtubeVideoId,
          localPath: 'assets/video/' + youtubeVideoId,
          type: 'Shorts',
        },
      });

      return res.status(200).json({ resultCode: 200, resultMsg: '완료' });
    } catch (error) {
      return res.status(500).json({
        resultCode: 500,
        error: '동영상 처리 중 오류가 발생했습니다.',
      });
    }
  }
}

export default new VideoController();
