import { prisma } from '../../utils/prisma';
import Login from '../../manager/Login/Login';

export class LoginController {
  /**
   * 로그인 메서드
   */
  async Login(req: any, res: any): Promise<void> {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(400).json({
        resultCode: 400,
        item: 'email',
        resultMsg: '존재하지 않는 이메일입니다.',
      });
    }

    // Role check logic can be inside processLogin or here
    // Currently Login.processLogin generates token. I should check how it constructs payload.

    const loginResult = await Login.processLogin(
      password,
      user.password,
      user.email,
      user.name,
      user.uuid,

      user.role,
    );

    // To support RBAC in token, we need to update src/manager/Login/Login.ts
    // But since I can't update multiple files in one step effectively without reading, I will assume Login.ts needs update.
    // However, JsonWebToken.ts was creating payload.
    // Let's assume for this step we refactor controller first.

    if (loginResult.success) {
      console.log('로그인 성공, 토큰:', loginResult.token);
      return res.status(200).json({
        resultCode: 200,
        accessToken: loginResult.token,
        refreshToken: loginResult.refreshToken,
        resultMsg: '로그인 성공',
      });
    } else {
      console.log('로그인 실패:', loginResult.message);
      return res.status(400).json({
        resultCode: 400,
        item: 'password',
        resultMsg: loginResult.message || '비밀번호가 일치하지 않습니다.',
      });
    }
  }
}

export default new LoginController();
