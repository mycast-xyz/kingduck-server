import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import UserActivityService from './UserActivityService';

class UserManagementService {
  /**
   * 사용자 목록 조회
   * @param page 페이지
   * @param limit 페이지당 수
   * @param filter 필터 (이름, 이메일 등)
   */
  async getUsers(
    page: number = 1,
    limit: number = 20,
    filter?: { email?: string; name?: string; role?: string },
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {};

    if (filter) {
      if (filter.email) {
        where.email = { contains: filter.email, mode: 'insensitive' };
      }
      if (filter.name) {
        where.name = { contains: filter.name, mode: 'insensitive' };
      }
      if (filter.role) {
        // Role enum 타입 캐스팅 필요
        where.role = filter.role as any;
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          createdAt: true,
          // 최근 활동 로그 1개만 가져와서 마지막 활동 시간 확인용
          activityLogs: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // 마지막 활동 시간 매핑
    const usersWithActivity = users.map((user) => ({
      ...user,
      lastActiveAt: user.activityLogs[0]?.createdAt || null,
      activityLogs: undefined, // 목록에서는 불필요한 로그 배열 제거
    }));

    return {
      users: usersWithActivity,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 단일 사용자 조회
   * @param userId 사용자 ID
   */
  async getUserById(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        createdAt: true,
        updatedAt: true,
        activityLogs: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    return user;
  }

  /**
   * 사용자 권한 수정
   * @param adminId 수정하는 관리자 ID
   * @param targetUserId 대상 사용자 ID
   * @param role 새 역할
   * @param permissions 새 세부 권한 (JSON)
   */
  async updateUserRole(
    adminId: number,
    targetUserId: number,
    role: string,
    permissions?: any,
  ) {
    // role 값 화이트리스트 검증
    const VALID_ROLES = ['USER', 'MANAGER', 'ADMIN'];
    if (!VALID_ROLES.includes(role)) {
      throw new Error('유효하지 않은 Role입니다.');
    }

    // 자기 자신 role 변경 금지
    if (adminId === targetUserId) {
      throw new Error('자신의 Role은 변경할 수 없습니다.');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    // 마지막 ADMIN 강등 방지
    if ((targetUser.role as string) === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' as any } });
      if (adminCount <= 1) {
        throw new Error('마지막 ADMIN의 역할은 변경할 수 없습니다.');
      }
    }

    const oldRole = targetUser.role;
    const oldPermissions = targetUser.permissions;

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        role: role as any,
        permissions: permissions !== undefined ? permissions : oldPermissions,
      },
      select: { id: true, email: true, role: true, permissions: true },
    });

    // 활동 로그 기록
    await UserActivityService.logActivity(adminId, 'UPDATE_ROLE', {
      targetUserId,
      targetUserEmail: targetUser.email,
      changes: {
        role: { from: oldRole, to: role },
        permissions: { from: oldPermissions, to: permissions },
      },
    });

    return updatedUser;
  }
}

export default new UserManagementService();
