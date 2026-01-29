import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

// Validation middleware that checks results
export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    resultCode: 400,
    resultMsg: '입력값이 올바르지 않습니다.',
    errors: errors.array().map((err) => ({
      path: (err as any).path || err.type, // 'path' in newer versions, fallback type
      msg: err.msg,
    })),
  });
};

// Account Creation Validator
export const registerValidator = [
  body('email')
    .isEmail()
    .withMessage('이메일 형식이 아닙니다.')
    .notEmpty()
    .withMessage('이메일을 입력해주세요.'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('비밀번호는 8자 이상이어야 합니다.')
    .notEmpty()
    .withMessage('비밀번호를 입력해주세요.'),
  body('passwordChk').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('비밀번호가 일치하지 않습니다.');
    }
    return true;
  }),
  body('name').notEmpty().withMessage('이름을 입력해주세요.'),
  validate,
];

// Login Validator (Optional, but good practice)
export const loginValidator = [
  body('email').isEmail().withMessage('이메일 형식이 아닙니다.'),
  body('password').notEmpty().withMessage('비밀번호를 입력해주세요.'),
  validate,
];
