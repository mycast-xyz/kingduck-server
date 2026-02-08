import axios from 'axios';
import { config } from 'dotenv';

config();

const API_URL = 'http://localhost:3000/api/v0';
// 테스트를 위해 로컬 서버가 실행 중이어야 함
// 실제 토큰을 발급받기 어렵다면, 이 테스트 스크립트는
// 1. 서버가 떠있음을 가정
// 2. 로그인 API를 호출하여 토큰을 얻거나 (Admin 계정 필요)
// 3. 단순히 구조만 출력 (인증 미들웨어를 잠시 끄거나, mock 테스트)

// 여기서는 간단히 API 호출 로직만 작성하고,
// 실제 실행 시에는 "로그인 -> 토큰 획득 -> API 호출" 흐름이 필요함.
// 편의상, 개발 환경에서 Auth Middleware를 잠시 Bypass하거나,
// 유효한 토큰을 환경 변수로 넣어서 테스트한다고 가정.

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

async function testSystemStats() {
  console.log('=== System Stats API Test ===');

  if (!ADMIN_TOKEN) {
    console.warn(
      '⚠️ ADMIN_TOKEN이 설정되지 않았습니다. 인증 오류가 발생할 수 있습니다.',
    );
  }

  const headers = {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  };

  try {
    console.log('\n1. Testing GET /admin/system/summary');
    const summaryRes = await axios.get(`${API_URL}/admin/system/summary`, {
      headers,
    });
    console.log('Status:', summaryRes.status);
    console.log('Data:', JSON.stringify(summaryRes.data, null, 2));
  } catch (error: any) {
    console.error(
      'Error fetching summary:',
      error.response?.data || error.message,
    );
  }

  try {
    console.log('\n2. Testing GET /admin/system/stats');
    const statsRes = await axios.get(`${API_URL}/admin/system/stats`, {
      headers,
    });
    console.log('Status:', statsRes.status);
    console.log('Data:', JSON.stringify(statsRes.data, null, 2));
  } catch (error: any) {
    console.error(
      'Error fetching stats:',
      error.response?.data || error.message,
    );
  }
}

testSystemStats();
