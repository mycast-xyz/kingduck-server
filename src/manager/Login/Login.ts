import { HashEncryptionUtil } from './HashEncryptionUtil';
import { generateToken, refreshToken } from './JsonWebToken';
import { BadRequest } from '../Errors/BadRequest';
import { InternalServerError } from '../Errors/InternalServerError';
import jwt from 'jsonwebtoken';
import { config } from '../../config/config';
import logger from '../../utils/logger';

interface LoginResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  message?: string;
  userName?: string;
  userUUID?: string;
}

export class Login {
  private hashEncryption: HashEncryptionUtil;

  constructor() {
    this.hashEncryption = new HashEncryptionUtil(10);
  }

  // 로그인 처리
  public async processLogin(
    inputPassword: string,
    storedPassword: string,
    userId: number,
    userName: string,
    userUUID: string,
    role: string,
  ): Promise<LoginResult> {
    try {
      // 비밀번호 확인
      const isPasswordMatch = await this.hashEncryption.comparePassword(
        inputPassword,
        storedPassword,
      );

      if (!isPasswordMatch) {
        throw new BadRequest('비밀번호가 일치하지 않습니다.', 'password');
      }

      // JWT 토큰 생성
      const token = generateToken({
        userId: userId,
        role: role,
        userName: userName,
        userUUID: userUUID,
      });

      return {
        success: true,
        token: token,
        refreshToken: refreshToken(token) || undefined,
        userName: userName,
        userUUID: userUUID,
      };
    } catch (error) {
      if (error instanceof BadRequest) {
        return {
          success: false,
          message: error.message,
        };
      }
      throw new InternalServerError(
        '로그인 처리 중 오류가 발생했습니다.',
        'login',
      );
    }
  }

  // 토큰 유효성 검사
  public async validateToken(token: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET_KEY);
      if (!decoded) {
        return false;
      }
      return true;
    } catch (error) {
      logger.error('토큰 검증 실패:', error);
      return false;
    }
  }

  // 토큰 갱신
  public async refreshUserToken(oldToken: string): Promise<LoginResult> {
    try {
      const newToken = refreshToken(oldToken);

      if (!newToken) {
        throw new BadRequest('토큰 갱신에 실패했습니다.', 'token');
      }

      return {
        success: true,
        token: newToken,
      };
    } catch (error) {
      return {
        success: false,
        message: '토큰 갱신에 실패했습니다.',
      };
    }
  }

  // 새로운 사용자 비밀번호 암호화
  public async encryptNewPassword(password: string): Promise<string> {
    try {
      return await this.hashEncryption.encryptPassword(password);
    } catch (error) {
      throw new InternalServerError(
        '비밀번호 암호화에 실패했습니다.',
        'password',
      );
    }
  }
}

export default new Login();
