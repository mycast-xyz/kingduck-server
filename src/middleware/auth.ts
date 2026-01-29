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

export const authorize = (allowedRoles: string[]) => {
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

      // Check if user exists in DB and explicitly check role if needed (optional for stateless JWT but safer)
      // For now, trust the token role to save DB call, OR fetch user to ensure not banned etc.
      // Let's verify role match.
      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      next();
    } catch (error) {
      logger.error('Auth Middleware Error:', error);
      return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    }
  };
};
