import logger from './logger';

export const formatDateString = (dateStr: string): string => {
  try {
    let date: Date;

    // 날짜 문자열에서 서수 표현(1st, 2nd, 3rd, th) 제거
    const cleanDateStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
    date = new Date(cleanDateStr);

    // 유효한 날짜인지 확인
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }

    // YYYY-MM-DD 형식으로 반환
    return date.toISOString().split('T')[0];
  } catch (error) {
    logger.error('날짜 변환 중 오류:', error);
    return dateStr; // 변환 실패시 원본 반환
  }
};

// 필요한 경우 시간을 포함한 전체 ISO 문자열을 반환하는 함수 추가
export const formatDateTimeString = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }

    return date.toISOString();
  } catch (error) {
    logger.error('날짜시간 변환 중 오류:', error);
    return dateStr;
  }
};
