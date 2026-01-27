# 붕괴: 스타레일 크롤러 리팩토링 (API 기반)

사용자가 제공한 API 엔드포인트를 사용하여 크롤링 방식을 HTML 파싱(Puppeteer)에서 JSON 데이터 Fetch(Axios)로 변경합니다. 속도와 안정성이 대폭 향상됩니다.

## 1. 대상 API 엔드포인트

| 카테고리   | 목록 URL                                           | 상세 URL 패턴 (예시)         |
| :--------- | :------------------------------------------------- | :--------------------------- |
| **캐릭터** | `https://api.hakush.in/hsr/data/character.json`    | `.../kr/character/{id}.json` |
| **광추**   | `https://api.hakush.in/hsr/data/lightcone.json`    | `.../kr/lightcone/{id}.json` |
| **유물**   | `https://api.hakush.in/hsr/data/relicset.json`     | `.../kr/relicset/{id}.json`  |
| **아이템** | (추정) `https://api.hakush.in/hsr/data/item.json`? | (불확실, 확인 필요)          |

## 2. 변경된 로직 흐름

1.  **목록 가져오기**: `axios.get(목록URL)`
2.  **순회 및 상세 조회**:
    - 목록의 각 항목(`id`)에 대해 상세 URL(`.../kr/.../{id}.json`) 요청.
    - 상세 JSON에서 이름, 속성, 이미지 URL(`icon`) 추출.
3.  **이미지 다운로드**:
    - 이미지 URL은 보통 `https://assets.hakush.in/hsr/...` 형태일 것으로 예상.
    - `ImageDownloader`를 사용하여 로컬에 WebP로 저장 (`static/image/starrail/...`).
4.  **DB 저장**:
    - 추출한 데이터를 Prisma `Character`, `Item` 모델에 저장.

### 3. 이미지 다운로드 및 관리 전략 (수정됨)

사용자가 지정한 최신 URL 패턴을 따릅니다.

- **캐릭터**:
  - 목록용: `https://api.hakush.in/hsr/UI/avatarshopicon/{id}.webp` -> `character/icon_{id}.webp`
  - 상세용: `https://api.hakush.in/hsr/UI/avatardrawcard/{id}.webp` -> `character/card_{id}.webp`
- **광추**:
  - 목록용: `https://api.hakush.in/hsr/UI/lightconemediumicon/{id}.webp` -> `lightcone/icon_{id}.webp`
  - 상세용: `https://api.hakush.in/hsr/UI/lightconemaxfigures/{id}.webp` -> `lightcone/card_{id}.webp`
- **유물**:
  - 세트: `https://api.hakush.in/hsr/UI/itemfigures/{id}.webp` -> `relic/set_{id}.webp`
  - 개별: (JSON 데이터 참조하여 파일명 추출 필요) -> `relic/part_{filename}.webp`
