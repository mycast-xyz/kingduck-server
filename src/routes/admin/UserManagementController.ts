import { Request, Response } from 'express';
import UserManagementService from '../../services/UserManagementService';
import UserActivityService from '../../services/UserActivityService';
import logger from '../../utils/logger';

class UserManagementController {
  /**
   * 사용자 목록 조회
   */
  getUsers = async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const email = req.query.email as string | undefined;
      const name = req.query.name as string | undefined;
      const role = req.query.role as string | undefined;

      const result = await UserManagementService.getUsers(page, limit, {
        email,
        name,
        role,
      });

      res.status(200).json(result);
    } catch (error) {
      logger.error('Get Users Error:', error);
      res
        .status(500)
        .json({ message: '사용자 목록을 가져오는 중 오류가 발생했습니다.' });
    }
  };

  /**
   */
  getUser = async (req: Request, res: Response) => {
    try {
      const userId = parseInt(String(req.params.userId));
      const user = await UserManagementService.getUserById(userId);
      res.status(200).json(user);
    } catch (error: any) {
      logger.error('Get User Error:', error);
      if (error.message === '사용자를 찾을 수 없습니다.') {
        return res.status(404).json({ message: error.message });
      }
      res
        .status(500)
        .json({ message: '사용자 정보를 가져오는 중 오류가 발생했습니다.' });
    }
  };

  /**
   * 사용자 권한 수정
   */
  updateUserRole = async (req: Request, res: Response) => {
    try {
      const adminId = req.user!.userId;
      const targetUserId = parseInt(String(req.params.userId));
      const { role, permissions } = req.body;

      if (!role) {
        return res.status(400).json({ message: 'Role은 필수입니다.' });
      }

      // 유효한 Role인지 확인 (간단한 검증)
      if (!['USER', 'MANAGER', 'ADMIN'].includes(role)) {
        return res.status(400).json({ message: '유효하지 않은 Role입니다.' });
      }

      const updatedUser = await UserManagementService.updateUserRole(
        adminId,
        targetUserId,
        role,
        permissions,
      );

      res.status(200).json(updatedUser);
    } catch (error: any) {
      logger.error('Update User Role Error:', error);
      res.status(400).json({
        message: error.message || '권한 수정 중 오류가 발생했습니다.',
      });
    }
  };

  /**
   * 사용자 상태 변경 (ACTIVE / BANNED)
   */
  updateUserStatus = async (req: Request, res: Response) => {
    try {
      const adminId = req.user!.userId;
      const targetUserId = parseInt(String(req.params.userId));
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ message: 'status는 필수입니다.' });
      }

      if (!['ACTIVE', 'BANNED'].includes(status)) {
        return res.status(400).json({ message: '유효하지 않은 상태값입니다. ACTIVE 또는 BANNED만 허용됩니다.' });
      }

      const result = await UserManagementService.updateUserStatus(adminId, targetUserId, status);
      res.status(200).json(result);
    } catch (error: any) {
      logger.error('Update User Status Error:', error);
      if (error.message === '사용자를 찾을 수 없습니다.') {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: error.message || '상태 변경 중 오류가 발생했습니다.' });
    }
  };

  /**
   * 사용자 활동 로그 조회 (특정 사용자)
   */
  getUserLogs = async (req: Request, res: Response) => {
    try {
      const targetUserId = parseInt(String(req.params.userId));
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await UserActivityService.getLogs(
        targetUserId,
        page,
        limit,
      );

      res.status(200).json(result);
    } catch (error) {
      logger.error('Get User Logs Error:', error);
      res
        .status(500)
        .json({ message: '활동 로그를 가져오는 중 오류가 발생했습니다.' });
    }
  };
}

export default new UserManagementController();
