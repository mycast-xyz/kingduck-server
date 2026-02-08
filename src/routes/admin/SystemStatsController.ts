import { Request, Response } from 'express';
import SystemStatsService from '../../services/SystemStatsService';
import logger from '../../utils/logger';

class SystemStatsController {
  /**
   * 시스템 요약 정보 조회
   */
  getSystemSummary = async (req: Request, res: Response) => {
    try {
      const summary = await SystemStatsService.getSystemSummary();
      res.status(200).json(summary);
    } catch (error) {
      logger.error('System Summary Error:', error);
      res
        .status(500)
        .json({ message: '시스템 정보를 가져오는 중 오류가 발생했습니다.' });
    }
  };

  /**
   * 실시간 시스템 리소스 조회
   */
  getSystemStats = async (req: Request, res: Response) => {
    try {
      const stats = await SystemStatsService.getSystemStats();
      res.status(200).json(stats);
    } catch (error) {
      logger.error('System Stats Error:', error);
      res
        .status(500)
        .json({ message: '시스템 리소스를 가져오는 중 오류가 발생했습니다.' });
    }
  };
}

export default new SystemStatsController();
