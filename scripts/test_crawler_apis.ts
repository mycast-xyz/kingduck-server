/**
 * 크롤러 API 테스트
 *
 * GET /api/v0/admin/crawler/status - 전체 크롤러 상태
 * GET /api/v0/admin/crawler/logs - 크롤러 로그
 * POST /api/v0/admin/crawler/run - 수동 실행
 * GET /api/v0/admin/crawler/run/:logId - 실행 상태
 */

async function testCrawlerAPIs() {
  console.log('=== Crawler Management API Endpoints ===\n');

  const apis = [
    {
      method: 'GET',
      path: '/api/v0/admin/crawler/status',
      desc: '전체 게임의 크롤러 상태 조회',
    },

    {
      method: 'GET',
      path: '/api/v0/admin/crawler/logs?page=1&limit=10',
      desc: '크롤러 실행 로그 조회 (페이지네이션)',
    },
    {
      method: 'GET',
      path: '/api/v0/admin/crawler/logs?gameId=13&crawlerType=event',
      desc: '게임/타입별 필터링',
    },
    {
      method: 'POST',
      path: '/api/v0/admin/crawler/run',
      desc: '크롤러 수동 실행',
      body: { gameSlug: 'endfield', crawlerType: 'event' },
    },
    {
      method: 'GET',
      path: '/api/v0/admin/crawler/run/:logId',
      desc: '크롤러 실행 상태 확인',
    },
  ];

  console.log('Note: 모든 엔드포인트는 ADMIN/MANAGER 권한 필요\n');

  apis.forEach((api) => {
    console.log(`${api.method} ${api.path}`);
    console.log(`  → ${api.desc}`);
    if (api.body) {
      console.log(`  Body: ${JSON.stringify(api.body)}`);
    }
    console.log('');
  });

  console.log('\n=== 사용 예시 ===\n');
  console.log('1. 크롤러 실행:');
  console.log('   POST /api/v0/admin/crawler/run');
  console.log('   { "gameSlug": "endfield", "crawlerType": "event" }');
  console.log('');
  console.log('2. 실행 상태 확인:');
  console.log(
    '   GET /api/v0/admin/crawler/run/:logId (응답에서 받은 logId 사용)',
  );
  console.log('');
  console.log('3. 로그 확인:');
  console.log('   GET /api/v0/admin/crawler/logs?page=1&limit=10');
}

testCrawlerAPIs().catch(console.error);
