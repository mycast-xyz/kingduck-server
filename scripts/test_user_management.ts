import axios from 'axios';
import { config } from 'dotenv';

config();

const API_URL = 'http://localhost:3000/api/v0';
// 실제 환경 테스트를 위해 유효한 ADMIN 토큰 필요
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

async function testUserManagement() {
  console.log('=== User Management API Test ===');

  if (!ADMIN_TOKEN) {
    console.warn('⚠️ ADMIN_TOKEN이 설정되지 않았습니다.');
  }

  const headers = {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  };

  try {
    console.log('\n1. Testing GET /admin/user/list');
    const listRes = await axios.get(`${API_URL}/admin/user/list?limit=5`, {
      headers,
    });
    console.log('Status:', listRes.status);
    console.log('Total Users:', listRes.data.pagination.total);
    console.log(
      'Users:',
      listRes.data.users.map((u: any) => `${u.email} (${u.role})`).join(', '),
    );

    if (listRes.data.users.length > 0) {
      const targetUser = listRes.data.users[0];
      const targetUserId = targetUser.id;

      console.log(`\n2. Testing GET /admin/user/${targetUserId}`);
      const userRes = await axios.get(`${API_URL}/admin/user/${targetUserId}`, {
        headers,
      });
      console.log('Status:', userRes.status);
      console.log('User Email:', userRes.data.email);

      console.log(`\n3. Testing GET /admin/user/${targetUserId}/logs`);
      const logsRes = await axios.get(
        `${API_URL}/admin/user/${targetUserId}/logs`,
        { headers },
      );
      console.log('Status:', logsRes.status);
      console.log('Logs Count:', logsRes.data.logs.length);
    }
  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testUserManagement();
