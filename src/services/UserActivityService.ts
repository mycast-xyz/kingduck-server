import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

class UserActivityService {
  /**
   * 사용자 활동 로그 기록
   * @param userId 사용자 ID
   * @param action 활동 유형 (예: LOGIN, UPDATE_ROLE)
   * @param details 상세 내용 (JSON)
   * @param ipAddress IP 주소
   */
  async logActivity(
    userId: number,
    action: string,
    details?: any,
    ipAddress?: string,
  ) {
    try {
      await prisma.userActivityLog.create({
        data: {
          userId,
          action,
          details: details ? details : undefined,
          ipAddress,
        },
      });
    } catch (error) {
      // 로그 기록 실패가 메인 로직을 방해하지 않도록 에러만 출력
      logger.error('Failed to log user activity:', error);
    }
  }

  /**
   * 사용자 활동 로그 조회
   * @param userId 사용자 ID (옵션, 없으면 전체 조회)
   * @param page 페이지 번호
   * @param limit 페이지당 항목 수
   */
  async getLogs(userId?: number, page: number = 1, limit: number = 20) {
    // B-H3: 음수 page → 음수 skip(Prisma 500), limit 과대값 → 메모리 폭증 방지
    page = Math.max(page, 1);
    limit = Math.min(Math.max(limit, 1), 100);
    const skip = (page - 1) * limit;
    const where = userId ? { userId } : {};

    const [logs, total] = await Promise.all([
      prisma.userActivityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      }),
      prisma.userActivityLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export default new UserActivityService();
