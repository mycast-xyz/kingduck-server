import jwt from 'jsonwebtoken'; // jwt 모듈 불러오기
import { config } from '../../config/config';
const secretKey = config.JWT_SECRET_KEY;

interface TokenPayload {
  userId: string;
  role: string; // Changed from isAdmin
  userName: string;
  userUUID: string;
}

const generateToken = (payload: TokenPayload): string => {
  const token = jwt.sign(payload, secretKey, { expiresIn: '1d' });
  return token;
}; // jwt.sign() 메서드를 통해 jwt 토큰 발행. expiresIn : '1d' 설정으로 1일 후 토큰이 만료되게 설정.

// 기존 토큰을 사용하여 새로운 토큰을 생성하는 함수
const refreshToken = (token: string): string | null => {
  try {
    // 기존 토큰의 유효성 검사 및 디코딩
    const decoded = jwt.verify(token, secretKey) as TokenPayload;

    // 새로운 페이로드 생성
    const payload: TokenPayload = {
      userId: decoded.userId,
      role: decoded.role,
      userName: decoded.userName,
      userUUID: decoded.userUUID,
    };

    // 새로운 토큰 생성
    const newToken = generateToken(payload);
    return newToken;
  } catch (error) {
    // 토큰 새로 고침 중 오류 발생 시 출력
    console.error('토큰 갱신 중 오류 발생:', error);
    return null;
  }
};

export { generateToken, refreshToken };
