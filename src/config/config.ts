const base =
  process.env.NODE_ENV === 'production'
    ? require('./application.prod.json')
    : require('./application.dev.json');

// 시크릿은 환경변수를 우선 적용한다(커밋된 값에 의존하지 않도록).
// prod 설정 JSON에는 시크릿을 두지 말고 JWT_SECRET_KEY 환경변수로 주입할 것.
export const config = {
  ...base,
  JWT_SECRET_KEY: process.env.JWT_SECRET_KEY ?? base.JWT_SECRET_KEY,
};

// 시크릿 미설정 시 조용히 undefined로 동작하다 로그인/인증이 전부 깨지는 것을 막기 위해 부팅 시 즉시 실패.
if (!config.JWT_SECRET_KEY) {
  throw new Error(
    'JWT_SECRET_KEY가 설정되지 않았습니다. 환경변수 JWT_SECRET_KEY를 지정하세요(프로덕션 필수).',
  );
}
