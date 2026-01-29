import { prisma } from '../../utils/prisma';
import { HashEncryptionUtil } from '../../manager/Login/HashEncryptionUtil';
import { randomUUID } from 'crypto';

/**
 * 계정 생성 및 관리를 위한 컨트롤러 클래스
 */
export class AccountController {
  /**
   * 계정 생성 메서드
   */
  async AccountCreateAll(req: any, res: any): Promise<void> {
    const { email, password, name, passwordChk } = req.body;

    console.log(email, name);

    const user = await prisma.user.findUnique({ where: { email } });

    // 이메일 유효성 검사 - 이메일 중복 (DB check remains as business logic)
    if (user) {
      return res.status(400).json({
        resultCode: 400,
        item: 'email',
        resultMsg: '이미 존재하는 이메일입니다.',
      });
    }

    const hashEncryptionUtil = new HashEncryptionUtil(15);
    const hashedPwd = await hashEncryptionUtil.encryptPassword(password);

    const uuid = randomUUID();

    try {
      // 사용자 데이터 생성 실행
      // 기본 Role은 USER (schema default)
      const result = await prisma.user.create({
        data: {
          email,
          password: hashedPwd,
          name,
          uuid,
          // role: 'USER' // Default is USER
        },
      });

      // 결과가 없는 경우 에러 응답
      if (!result) {
        return res.status(500).json({
          resultCode: 500,
          item: 'user',
          resultMsg: '계정생성에 오류가 있습니다.',
        });
      }

      // 성공 응답 반환
      return res.status(200).json({
        resultCode: 200,
        item: 'ok',
        resultMsg: '생성 완료',
      });
    } catch (error) {
      console.error(error);
      // 에러 발생 시 에러 응답
      return res.status(500).json({
        resultCode: 500,
        resultMsg: '서버 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 이메일 중복 체크 메서드
   */
  async AccountCheckEmail(req: any, res: any): Promise<void> {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      return res.status(400).json({
        resultCode: 400,
        item: 'email',
        resultMsg: '이미 존재하는 이메일입니다.',
      });
    }

    // 성공 응답 반환
    return res.status(200).json({
      resultCode: 200,
      item: 'ok',
      resultMsg: '사용 가능한 이메일입니다.',
    });
  }
}

export default new AccountController();
