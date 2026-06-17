# 원신 추천(궁합) 데이터 기획안 — 보류

> 상태: **조사 완료 / 구현 보류** (2026-06-17). 사용자 결정에 따라 소스 조사만 정리하고 보류.

## 목적
캐릭터 상세 페이지에 **주관적 추천 데이터**를 표기:
- 이 캐릭터에게 궁합이 좋은 **무기**
- 추천 **성유물**(세트 + 메인/서브 스탯)
- 이 캐릭터와 좋은 **파티 조합**

이 데이터는 "객관 데이터"(스킬/별자리/스탯/승급재료 — Ambr로 확보)와 달리,
누군가의 **큐레이션/티어 판단**이 필요해 Ambr 같은 공식 데이터 API에는 없다.

## 소스 조사 결과 (2026-06-17)

| 소스 | 추천 데이터 | 접근성 | 비고 |
|---|---|---|---|
| **Ambr** (gi.yatta.moe) | ❌ | API(JSON) | 객관 데이터 전용. event/gacha/build 엔드포인트 전부 404 |
| **genshin-db** (genshin-db-api) | ❌ | API(JSON) | 이름/스탯 등 객관 데이터만 |
| **paimon.moe** | △ (빌드 일부) | SPA(직접 JSON 경로 없음) | 데이터는 GitHub 저장소(MadeBaruna/paimon-moe)의 번들 파일에 존재 — 경로 특정 필요 |
| **genshin.gg** | ✅ (무기/성유물/파티 빌드 가이드) | HTML 스크래핑 | 캐릭터별 빌드 섹션 구조적. 공식 API 없음 → HTML 파싱 |
| **KQM / keqingmains** | ✅ (정밀 이론) | HTML/문서 | 가장 신뢰도 높으나 구조 비정형 |

**결론**: 깨끗한 공식 API는 없음. 현실적 후보는 (a) **genshin.gg HTML 스크래핑** 또는
(b) **paimon.moe GitHub 번들 데이터** 파싱.

## 권장 접근(구현 시)
1. **1순위: genshin.gg HTML 스크래핑**
   - 캐릭터별 페이지에서 추천 무기 리스트 / 성유물 세트 + 스탯 / 추천 파티 추출.
   - ScraperBase 패턴으로 `GenshinBuildScraper` 신설, 결과를 character.metadata에 병합
     (`recommendedWeapons`, `recommendedArtifacts`, `teams`). starrail이 teams/lightcones를
     metadata에 들고 있던 것과 동일 구조로 맞추면 프론트(TeamRecommendationView/
     BuildRecommendationView/MainItemView)를 그대로 재사용 가능.
   - 무기/성유물은 이름→originalId 매핑 필요(이미 크롤한 weapon 246 / material·성유물 데이터와 조인).
2. **2순위: paimon.moe GitHub 데이터** — 라이선스/구조 확인 후 번들 JSON 직접 사용.

## 리스크 / 고려사항
- **유지보수**: HTML 구조 변경 시 파서 깨짐(starrail SRS 사례와 동일 리스크).
- **신뢰성/출처표기**: 제3자 큐레이션이므로 출처 명시 + "참고용" 라벨 권장.
- **버전 의존**: 메타(추천)는 패치마다 변함 → 정기 재크롤 필요.
- **프론트는 이미 준비됨**: TeamRecommendationView / BuildRecommendationView 컴포넌트가
  존재하므로, 데이터만 metadata에 채우면 starrail과 동일 틀로 노출 가능.

## 함께 보류된 항목
- **아이템 브라우징 그리드(#2 원안)**: genshin 아이템 1010건(무기246+재료764) > item list API
  상한 1000(B-H3 silent truncation). 타입 필터 + 페이지네이션 정비가 선행되어야 함.
  추천 데이터 표기가 더 가치 크다는 판단으로 그리드 노출은 함께 보류.
