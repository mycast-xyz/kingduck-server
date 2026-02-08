/**
 * Admin Event List API 테스트
 *
 * 사용법:
 * npx tsx scripts/test_admin_events.ts
 */

async function testAdminEventList() {
  const baseUrl = 'http://localhost:3000/api/v0/admin/event/list';

  console.log('Testing Admin Event List API...\n');

  const tests = [
    { name: 'All events (page 1)', params: 'page=1&limit=5' },
    { name: 'Filter by gameId=13', params: 'page=1&limit=5&gameId=13' },
    { name: 'Filter by type=GACHA', params: 'page=1&limit=5&type=GACHA' },
    { name: 'Filter by type=EVENT', params: 'page=1&limit=5&type=EVENT' },
  ];

  for (const test of tests) {
    console.log(`Test: ${test.name}`);
    console.log(`URL: ${baseUrl}?${test.params}`);
    console.log('Note: This endpoint requires ADMIN/MANAGER authentication\n');
  }

  console.log('API Endpoint: GET /api/v0/admin/event/list');
  console.log('\nQuery Parameters:');
  console.log('  - page (optional): Page number (default: 1)');
  console.log('  - limit (optional): Items per page (default: 20)');
  console.log('  - gameId (optional): Filter by game ID');
  console.log(
    '  - type (optional): Filter by event type (GACHA, EVENT, MAINTENANCE, SPECIAL)',
  );
  console.log('  - title (optional): Search by title (case-insensitive)');
  console.log('\nResponse Format:');
  console.log('  {');
  console.log('    resultCode: 200,');
  console.log('    resultMsg: "성공",');
  console.log('    data: {');
  console.log('      total: number,');
  console.log('      page: number,');
  console.log('      limit: number,');
  console.log('      totalPages: number,');
  console.log('      items: CalendarEvent[]');
  console.log('    }');
  console.log('  }');
}

testAdminEventList().catch(console.error);
