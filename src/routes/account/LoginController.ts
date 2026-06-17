import { prisma } from '../../utils/prisma';
import Login from '../../manager/Login/Login';
import logger from '../../utils/logger';

export class LoginController {
  /**
   * 로그인 메서드
   */
  async Login(req: any, res: any): Promise<void> {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(400).json({
          resultCode: 400,
          item: 'email',
          resultMsg: '존재하지 않는 이메일입니다.',
        });
      }

      const loginResult = await Login.processLogin(
        password,
        user.password,
        user.email,
        user.name,
        user.uuid,
        user.role,
      );

      if (loginResult.success) {
        return res.status(200).json({
          resultCode: 200,
          accessToken: loginResult.token,
          refreshToken: loginResult.refreshToken,
          resultMsg: '로그인 성공',
        });
      } else {
        return res.status(400).json({
          resultCode: 400,
          item: 'password',
          resultMsg: loginResult.message || '비밀번호가 일치하지 않습니다.',
        });
      }
    } catch (error) {
      logger.error('로그인 처리 중 오류:', error);
      return res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }
}

export default new LoginController();
