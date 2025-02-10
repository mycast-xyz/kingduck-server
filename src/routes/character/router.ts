import express from 'express';

// 컨트롤러 참조
import CharacterController from './characterController';
import CharacterTestController from './characterTestController';
import characterCreateController from './characterCreateController';

const router = express.Router();

//router.use(cors(corsOpt));

// 테스트용
router.get(
  '/HonkaiStarRail/setData',
  characterCreateController.HonkaiStarRailCharacterSet,
);
router.get(
  '/GirlsFrontline2/setData',
  characterCreateController.GirlsFrontline2CharacterSet,
);
router.get('/Nikke/setData', characterCreateController.NikkeCharacterSet);

// 어드민용
router.get('/admin', CharacterController.getCharacterAdmin);

// 요청 method 별로 라우팅
router.get('/:slug', CharacterController.getCharacterList); // 전체 리스트 조회
router.get('/:slug/:id', CharacterController.getCharacter); // 특정 캐릭터 조회

export default router;
