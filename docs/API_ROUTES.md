# API 라우트 문서

이 서버는 게임 데이터, 계정 및 리소스를 관리하기 위한 RESTful API를 제공합니다.

## 기본 URL (Base URL)

`/api`

## 모듈 (Modules)

### 1. Game (`/api/games`)

- **GET /**: 모든 게임 목록 조회.
- **POST /**: 새로운 게임 생성.
- **GET /:id**: 특정 게임 상세 정보 조회.

### 2. Character (`/api/characters`)

- **GET /**: 캐릭터 목록 조회 (게임, 속성 등으로 필터링 지원).
- **GET /:id**: 특정 캐릭터 상세 정보 조회.
- **POST /**: 캐릭터 수동 생성.
- **PUT /:id**: 캐릭터 정보 수정.

### 3. Element (`/api/elements`)

- **GET /**: 속성(Element) 목록 조회.
- **POST /**: 속성 생성.

### 4. Item (`/api/items`)

- **GET /**: 아이템 목록 조회.
- **POST /**: 아이템 생성.

### 5. Video (`/api/videos`)

- **GET /**: 동영상 목록 조회.
- **POST /**: 동영상 메타데이터 생성.

### 6. Account (`/api/accounts`)

- **POST /register**: 신규 사용자 가입.
- **POST /login**: 사용자 로그인 (인증).
