import express from 'express';
import rateLimit from 'express-rate-limit';

// 컨트롤러 참조
import AccountController from './AccountController';
import LoginController from './LoginController';

import { registerValidator, loginValidator, emailValidator } from './validator';

const router = express.Router();

//router.use(cors(corsOpt));

// 인증 관련 라우트 rate limit: 15분 창 동안 IP당 최대 20회
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { resultCode: 429, resultMsg: '너무 많은 요청입니다. 잠시 후 다시 시도하세요.' },
});

// 요청 method 별로 라우팅itemSet
router.post(
  '/create/account',
  authLimiter,
  registerValidator,
  AccountController.AccountCreateAll,
);
router.post(
  '/validate/email',
  authLimiter,
  emailValidator,
  AccountController.AccountCheckEmail,
);
router.post('/login', authLimiter, loginValidator, LoginController.Login);

export default router;
