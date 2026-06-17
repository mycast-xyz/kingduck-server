import express from 'express';
import rateLimit from 'express-rate-limit';

// 컨트롤러 참조
import VideoController from './videoController';
import { authorize } from '../../middleware/auth';

const router = express.Router();

//router.use(cors(corsOpt));

// 이 엔드포인트는 매 호출마다 yt-dlp/puppeteer 서브프로세스로 영상을 다운로드하는 고비용
// 인제스트 작업이다. 미인증 노출 시 자원 고갈(DoS) 표면이 된다(B-S8). 인증(ADMIN/MANAGER) +
// 엄격한 rate limit으로 보호. (프론트는 이 엔드포인트를 호출하지 않음 — 관리/인제스트 전용.)
const videoLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10분
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    resultCode: 429,
    resultMsg: '비디오 요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  },
});

// 요청 method 별로 라우팅itemSet
router.get(
  '/get/youtube/:characterId/:youtubeVideoId',
  authorize(['ADMIN', 'MANAGER']),
  videoLimiter,
  VideoController.getYoutubeVideo,
);

export default router;
