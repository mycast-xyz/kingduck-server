import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

// Type definition for JWT payload
interface DecodedToken {
  userId: number; // or string based on your schema, but schema says Int
  role: string;
  iat: number;
  exp: number;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: DecodedToken;
    }
  }
}

interface AuthorizeOptions {
  // true면 매 요청마다 DB에서 사용자 role/밴 상태를 재확인한다(stateless JWT의 한계 보완).
  // 토큰 발급(최대 1일) 이후의 강등/밴이 즉시 반영된다. 민감 라우트(어드민)에 사용.
  recheckDb?: boolean;
}

export const authorize = (
  allowedRoles: string[],
  options: AuthorizeOptions = {},
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({ message: '인증 토큰이 없습니다.' });
      }

      const token = authHeader.split(' ')[1]; // Bearer <token>
      if (!token) {
        return res.status(401).json({ message: '잘못된 토큰 형식입니다.' });
      }

      const decoded = jwt.verify(token, config.JWT_SECRET_KEY) as DecodedToken;
      req.user = decoded;

      // 기본: 토큰의 role을 신뢰(무상태, DB 호출 절약).
      let effectiveRole = decoded.role;

      // recheckDb: 민감 작업은 DB에서 현재 role/밴 상태를 재확인한다(B-S6).
      // 밴은 별도 컬럼이 없어 permissions._status === 'banned'로 저장됨(B-H1 임시 방식).
      if (options.recheckDb) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { role: true, permissions: true },
        });
        if (!user) {
          return res.status(401).json({ message: '존재하지 않는 사용자입니다.' });
        }
        const status = (user.permissions as { _status?: string } | null)?._status;
        if (status === 'banned') {
          return res.status(403).json({ message: '정지된 계정입니다.' });
        }
        effectiveRole = user.role;
        // 토큰 role과 DB role이 다르면(강등 등) DB를 신뢰하도록 req.user 갱신
        req.user = { ...decoded, role: user.role };
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(effectiveRole)) {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      next();
    } catch (error) {
      logger.error('Auth Middleware Error:', error);
      return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    }
  };
};
