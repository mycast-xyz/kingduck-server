import fs from 'fs';
import * as ApiUtils from '../../utils/apiUtils';
import YoutubeUtils, { fetchAndDownloadVideo } from '../../utils/youtubeUtils';
import path from 'path';

export class VideoController {
  // 유튜브 크롤링 후 영상 다운로드 처리 구현
  // 파이썬 3.7 이상 설치 필요
  // 파이썬 전역 변수가 잘 되어있는지 확인 필요
  // youtube-dl 설치 필요 : pip install youtube-dl
  // ffmpeg 설치 필요 - 전역 변수 설정 필요 x - 설치 경로 필요
  // 참조 : https://github.com/microlinkhq/youtube-dl-exec
  async getYoutubeVideo(req: any, res: any): Promise<void> {
    const { characterId, youtubeVideoId } = req.params;

    if (!characterId || !youtubeVideoId) {
      return res.status(400).json({
        resultCode: 400,
        error: '캐릭터 ID와 YouTube 동영상 ID가 필요합니다.',
      });
    }

    // 캐릭터 존재 여부 확인
    const character = await Character.findByPk(characterId);
    if (!character) {
      return res.status(404).json({
        resultCode: 400,
        error: '캐릭터를 찾을 수 없습니다.',
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

    const characterYoutube =
      await YoutubeUtils.downloadVideoById(youtubeVideoId);

    console.log(characterYoutube);

    if (characterYoutube) {
      await CharacterImage.create({
        characterId: characterId,
        backgroundColor: '#ffffff',
        layout: 'video',
        url: 'assets/video/' + youtubeVideoId,
      });
      return res.status(200).json({
        resultCode: 200,
        resultMsg: '완료',
      });
    } else {
      return res.status(400).json({
        resultCode: 400,
        error: '유효하지 않은 YouTube 동영상 ID입니다.',
      });
    }
  }
}

export default new VideoController();
