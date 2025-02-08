import GirlsFrontline2CharacterQuery from './CharacterQuery';
import GameQuery from '../AllGame/GameQuery';

/**
 * 캐릭터 검색 관련 기능을 담당하는 클래스
 */
class GirlsFrontline2CharacterSearch {
  async searchCharacterList(
    gameData: any,
    typeConditions: any[],
    raityConditions: string,
  ) {
    let rarityOptions;
    if (raityConditions) {
      rarityOptions = { rarity: raityConditions };
    }
    // 받아온 데이터 처리
    const setTypeOptions = (
      types: Array<{ key: string; value: string }>,
    ): Record<string, string> => {
      const typeOptions: Record<string, string> = {};

      types.forEach((type) => {
        if (type.key === 'weaponType') {
          typeOptions['type.weapon'] = type.value;
        }
        if (type.key === 'elementType') {
          typeOptions['type.element'] = type.value;
        }
        if (type.key === 'corpType') {
          typeOptions['type.corp'] = type.value;
        }
      });

      return typeOptions;
    };

    const typeOptions = setTypeOptions(typeConditions);

    // 게임의 타입(속성, 경로) 정보 조회
    const typeList = await GameQuery.getTypeList(gameData.id);

    // 캐릭터 기본 정보 목록 조회
    let characterList;
    if (typeOptions || rarityOptions) {
      characterList =
        await GirlsFrontline2CharacterQuery.getCharacterListWithConditions(
          gameData.id,
          typeOptions,
          rarityOptions,
        );
    } else {
      characterList = await GirlsFrontline2CharacterQuery.getCharacterList(
        gameData.id,
      );
    }

    // 각 캐릭터에 속성과 경로 정보를 매핑
    const mappedCharacters = characterList.map((character: any) => ({
      ...character,
      // 캐릭터의 속성(element) 정보 매핑
      type: {
        weapon: typeList.find(
          (typeItem: any) =>
            Number(typeItem.id) === Number(character.type.weapon),
        ),
        corp: typeList.find(
          (typeItem: any) =>
            Number(typeItem.id) === Number(character.type.corp),
        ),
        element: typeList.find(
          (typeItem: any) =>
            Number(typeItem.id) === Number(character.type.element),
        ),
      },
    }));

    // 결과 반환
    return {
      resultCode: 200,
      items: mappedCharacters,
      resultMsg: 'SUCCESS',
    };
  }
  async searchCharacterDetail(gameData: any, id: any) {
    console.log(id);

    // 캐릭터의 기본 정보 조회
    const characterData =
      await GirlsFrontline2CharacterQuery.getCharacterDetail(id);
    if (!characterData) {
      throw new Error('Character not found');
    }

    // 캐릭터의 추가 정보(속성, 경로, 스킬, 이미지) 병렬 조회
    const [elementType, weaponType, corpType, skillData, images] =
      await GirlsFrontline2CharacterQuery.getCharacterAdditionalInfo(
        characterData.type?.element,
        characterData.type?.weapon,
        characterData.type?.corp,
        id,
      );

    // 캐릭터의 장착 아이템 정보 조회
    const [[weaponItems]] = await Promise.all([
      GirlsFrontline2CharacterQuery.getCharacterItems(
        characterData.info?.itemData,
      ),
    ]);

    console.log(characterData);

    // 응답 데이터 구성
    const responseData = {
      ...characterData,
      type: {
        element: elementType,
        weapon: weaponType,
        corp: corpType,
      },
      info: {
        ...characterData.info,
        itemData: {
          weapon: weaponItems,
        },
      },
      images,
      skill: skillData,
    };

    // 결과 반환
    return {
      resultCode: 200,
      items: responseData,
      resultMsg: 'SUCCESS',
    };
  }

  // 나무위키 소녀전선2 캐릭터 리스트 처리
  async ListNamuWikiSearch(page: any) {
    try {
      // 본문 내용 추출
      const references = await page.evaluate(() => {
        const referenceElements = Array.from(
          document.querySelectorAll('._77e71e6e419071cb32f095b2bee8b744'),
        )
          .map((tr) => {
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 2) {
              const imgElement = tds[0]?.querySelector('img[loading="lazy"]');
              const titleElement = tds[0]?.querySelector('strong');
              const divElement = tds[0]?.querySelector(
                'div[style="margin-top:-1px;font-size:0.65em"]',
              );

              const linkElements = tds[1]?.querySelectorAll('a');
              const links = Array.from(linkElements || [])
                .map((link) => {
                  const title = link.getAttribute('title');
                  if (!title) return null;
                  return {
                    title: title,
                    href: link.getAttribute('href') || '',
                  };
                })
                .filter((link) => link !== null);

              return {
                title: {
                  image: imgElement?.src || '',
                  title: titleElement?.textContent?.trim() || '',
                  subTitle: divElement?.textContent?.trim() || '',
                },
                links: links || '',
                length: tds.length,
              };
            }
            return null;
          })
          .filter((item) => item !== null);
        return {
          referenceElements,
        };
      });
      return references;
    } catch (error) {
      console.error('데이터 추출 중 오류:', error);
      throw error;
    }
  }
  // 나무위키 소녀전선2 캐릭터 정보 처리
  async InfoNamuWikiSearch(page: any) {
    try {
      // 본문 내용 추출
      const references = await page.evaluate(() => {
        // 안전한 텍스트 추출 헬퍼 함수
        const safeGetText = (element: Element | null): string => {
          return element?.textContent?.trim() || '';
        };

        // 테이블 행 데이터 추출 함수
        const CharacterInfoTableRows = (trElements: any, keyword: string) => {
          return trElements
            .map((tr) => {
              const tds = Array.from(tr.querySelectorAll('td'));
              return tr.textContent.includes(keyword)
                ? {
                    type: tds[0]?.textContent?.trim() || '',
                    value: tds[1]?.textContent?.trim() || '',
                  }
                : null;
            })
            .filter((item) => item !== null);
        };

        const SkillTableRows = (trElements: any) => {
          return trElements
            .map((tr) => {
              const tds = Array.from(tr.querySelectorAll('td'));
              return tr?.textContent?.includes('일반공격') ||
                tr?.textContent?.includes('액티브') ||
                tr?.textContent?.includes('결전기') ||
                tr?.textContent?.includes('패시브')
                ? {
                    image: tds[0]?.textContent?.trim() || '',
                    value: {
                      title:
                        tds[1]?.querySelector('strong')?.textContent?.trim() ||
                        '',
                      description:
                        tds[1]?.textContent
                          ?.replace(
                            tds[1]?.querySelector('strong')?.textContent || '',
                          )
                          ?.trim() || '',
                    },
                  }
                : null;
            })
            .filter((item) => item !== null);
        };

        // 캐릭터 정보 추출
        let characterElements = Array.from(
          document.querySelectorAll('._77e71e6e419071cb32f095b2bee8b744') || [],
        )
          .map((tr) => {
            try {
              const nameElement = tr.querySelector(
                '._f2e45c8c47fa444a1b8d9d005ec3b518',
              );
              if (!nameElement) return null;
              let nameKr = '';
              let nameEn = '';
              if (nameElement) {
                const strongElement = nameElement.querySelector('strong');

                const spanElement = strongElement.querySelector('span');
                nameKr = spanElement?.textContent?.trim() || '';
                nameEn =
                  nameElement.textContent
                    ?.replace(strongElement.textContent || '', '')
                    .trim() || '';
              }
              const imageElement = tr.querySelector(
                'td.J0-mIdx0 img._66lDSM6b',
              );
              const imageSrc = imageElement?.src || '';

              // 레어도 정보 추출
              const tds = Array.from(
                tr.querySelectorAll('td._dc7c67fe280cc9a49a3a67c43813ded9'),
              );
              const trElements = Array.from(tds).map((td) => td.closest('tr'));

              // tr 데이터 추출
              const rarityData = CharacterInfoTableRows(trElements, '레어도');
              const affiliation = CharacterInfoTableRows(trElements, '소속');
              const type = CharacterInfoTableRows(trElements, '속성');
              const corp = CharacterInfoTableRows(trElements, '직업');
              const weapon = CharacterInfoTableRows(trElements, '무기');
              const modal = CharacterInfoTableRows(trElements, '모델');
              const nameList = CharacterInfoTableRows(
                trElements,
                '언어별 표기',
              );
              const voice = CharacterInfoTableRows(trElements, '성우');

              return {
                name: {
                  kr: nameKr,
                  en: nameEn,
                },
                image: imageSrc,
                rarity: rarityData,
                affiliation: affiliation,
                type: type,
                corp: corp,
                weapon: weapon,
                modal: modal,
                nameList: nameList,
                voice: voice,
              };
            } catch (err) {
              console.error('캐릭터 정보 추출 중 오류:', err);
              return null;
            }
          })
          .filter((item) => item !== null);

        if (characterElements.length == 0) {
          console.log('스킬 정보가 없습니다. 추가 방안 1');
          characterElements = Array.from(
            document.querySelectorAll('._10eba5bdae7643b4de684fd93f81f4f2') ||
              [],
          )
            .map((tr) => {
              try {
                const nameElement = tr.querySelector(
                  '._cb4126b23b3ae646ee4d5f64d79398f7',
                );
                if (!nameElement) return null;
                let nameKr = '';
                let nameEn = '';
                if (nameElement) {
                  const strongElement = nameElement.querySelector('strong');

                  const spanElement = strongElement.querySelector('span');
                  nameKr = spanElement?.textContent?.trim() || '';
                  nameEn =
                    nameElement.textContent
                      ?.replace(strongElement.textContent || '', '')
                      .trim() || '';
                }
                const imageElement = tr.querySelector(
                  'td.J0-mIdx0 img._66lDSM6b',
                );
                const imageSrc = imageElement?.src || '';

                // 레어도 정보 추출
                const tds = Array.from(
                  tr.querySelectorAll('td._573d4df1d40ab6bc664d0e5acb7696fc'),
                );
                const trElements = Array.from(tds).map((td) =>
                  td.closest('tr'),
                );

                // tr 데이터 추출
                const rarityData = CharacterInfoTableRows(trElements, '레어도');
                const affiliation = CharacterInfoTableRows(trElements, '소속');
                const type = CharacterInfoTableRows(trElements, '속성');
                const corp = CharacterInfoTableRows(trElements, '직업');
                const weapon = CharacterInfoTableRows(trElements, '무기');
                const modal = CharacterInfoTableRows(trElements, '모델');
                const nameList = CharacterInfoTableRows(
                  trElements,
                  '언어별 표기',
                );
                const voice = CharacterInfoTableRows(trElements, '성우');

                return {
                  name: {
                    kr: nameKr,
                    en: nameEn,
                  },
                  image: imageSrc,
                  rarity: rarityData,
                  affiliation: affiliation,
                  type: type,
                  corp: corp,
                  weapon: weapon,
                  modal: modal,
                  nameList: nameList,
                  voice: voice,
                };
              } catch (err) {
                console.error('캐릭터 정보 추출 중 오류:', err);
                return null;
              }
            })
            .filter((item) => item !== null);
        }

        // 스킬 정보 추출
        let skillElements = Array.from(
          document.querySelectorAll('._38f185c22e4e5a213c9fed06728e5821') || [],
        )
          .map((element) => {
            try {
              const tds = Array.from(
                element.querySelectorAll('img[loading="lazy"]'),
              );

              let SKillTitleElement;

              const trElements = Array.from(tds).map((td) => td.closest('tr'));
              if (trElements) {
                SKillTitleElement = SkillTableRows(trElements);
              }
              // colspan="2" 태그를 가진 td 엘리먼트 찾기
              const skillDescTds = Array.from(
                element.querySelectorAll('td[colspan="2"]'),
              );

              // 스킬 설명 텍스트 추출
              let skillDescription = '';
              let skillDetailContent = {};
              if (skillDescTds.length > 0) {
                skillDescription = skillDescTds[0].textContent?.trim() || '';
                // 두 번째 td에서 dl 태그 찾기
                if (skillDescTds.length > 1) {
                  const dlElement = skillDescTds[1].querySelector('dl');
                  if (dlElement) {
                    // dt 태그에서 타이틀 추출
                    const dtElement = dlElement.querySelector('dt');
                    if (dtElement) {
                      skillDetailContent.title =
                        dtElement.textContent?.trim() || '';
                    }

                    // dd > table > tbody > tr > td 경로의 HTML 저장
                    const tdElement = dlElement.querySelector(
                      'dd table tbody tr td',
                    );
                    if (tdElement) {
                      skillDetailContent.content = tdElement.outerHTML;
                    }
                  }
                }
              }
              // 스킬 값에 추가
              return {
                title: SKillTitleElement,
                description: skillDescription,
                detail: skillDetailContent,
              };
            } catch (err) {
              console.error('스킬 정보 추출 중 오류:', err);
              return null;
            }
          })
          .filter((item) => item !== null);

        // 스킬을 못처리 할경우
        if (skillElements.length == 0) {
          skillElements = Array.from(
            document.querySelectorAll('.GFclleaN._5EZzdmZE')[1]?.children || [],
          ).map((element: Element) => {
            try {
              const skillRows = Array.from(element.querySelectorAll('tr'));
              const skillData = skillRows.map((tr) => {
                // 타이틀 부분 class 추출
                const hasClass = tr.classList.contains(
                  '_e4b3504a80ddb23176609fdef966c404',
                );
                if (hasClass) {
                  return;
                }
                // 스킬 정보 추출
                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length > 2) {
                  const skill = tds.map((td) => {
                    const tdText = td.textContent?.trim() || '';
                    return tdText;
                  });
                  return skill;
                }
                return;
              });
              return {
                description: skillData,
              };
            } catch (err) {
              console.error('스킬 정보 추출 중 오류:', err);
              return;
            }
          });
          // 스킬 데이터 정리
          const processedSkills = [];
          let skillid = 0;
          for (let i = 0; i < skillElements[0].description.length; i++) {
            const skillElement = skillElements[0].description[i];
            if (skillElement != null) {
              let title = [];
              let titleImage = '';
              let description = '';
              let skillDetailContent = {};
              for (let ii = 0; ii < skillElement.length; ii++) {
                if (ii === 0) {
                  titleImage = skillElement[ii];
                } else if (ii === 1) {
                  description = skillElement[ii];
                } else if (ii === 2) {
                  skillDetailContent.title = '마인드 보강 & 사거리 ▼';
                  skillDetailContent.content = skillElement[ii];
                }
              }
              title.push({
                image: titleImage,
                value: {
                  title: `스킬${skillid}`,
                  description: '',
                },
              });
              processedSkills.push({
                title: title,
                description: description,
                detail: skillDetailContent,
              });
              skillid++;
            }
          }
          skillElements = processedSkills;
        }

        // 뉴럴 업그레이드 정보 추출
        const neuralElements = Array.from(
          document.querySelectorAll('._6803dcde6a09ae387f9994555e73dfd7') || [],
        )
          .map((element) => {
            try {
              // 테이블 제목 추출 (colspan="3" 태그를 가진 td 엘리먼트 찾기)
              const titleElement = element.querySelector('td[colspan="3"]');
              let title = titleElement?.textContent?.trim() || '';

              if (title == '') {
                const titleElement = element.querySelector('td[colspan="4"]');
                title = titleElement?.textContent?.trim() || '';
              }

              // 테이블 제목에 따라 다른 처리
              if (title == '키 리스트') {
                // 키 리스트 테이블 처리
                const keyRows = element.querySelectorAll('tr')
                  ? Array.from(element.querySelectorAll('tr'))
                  : [];
                const keyData = keyRows
                  .map((tr) => {
                    const tds = Array.from(tr.querySelectorAll('td'));
                    if (tds.length > 1) {
                      // tds의 각 요소 순회하며 내용 확인
                      let cells: any = [];
                      tds.forEach((td, idx) => {
                        cells.push({
                          idx: idx,
                          html: td.innerHTML,
                          text: td.textContent,
                        });
                      });
                      return cells;
                    }
                  })
                  .filter((row) => row !== null);

                return {
                  type: 'keyList',
                  data: keyData,
                  length: keyData.length,
                };
              } else if (title === '효과') {
                // 키 리스트 테이블 처리
                const mindSetRows = element.querySelectorAll('tr')
                  ? Array.from(element.querySelectorAll('tr'))
                  : [];
                const mindSetData = mindSetRows
                  .map((tr) => {
                    const tds = Array.from(tr.querySelectorAll('td'));
                    if (tds.length > 1) {
                      // tds의 각 요소 순회하며 내용 확인
                      let cells: any = [];
                      tds.forEach((td, idx) => {
                        cells.push({
                          idx: idx,
                          html: td.innerHTML,
                          text: td.textContent,
                        });
                      });
                      return cells;
                    }
                  })
                  .filter((row) => row !== null);

                return {
                  type: 'mindSet',
                  data: mindSetData,
                  length: mindSetData.length,
                };
              } else {
                return null;
              }
            } catch (err) {
              console.error('뉴럴 정보 추출 중 오류:', err);
              return null;
            }
          })
          .filter((item) => item !== null);

        return {
          extractedData: {
            characters: characterElements,
            skills: skillElements,
            neural: neuralElements,
          },
        };
      });

      return references;
    } catch (error) {
      console.error('데이터 추출 중 오류:', error);
      return {
        extractedData: {
          characters: [],
          skills: [],
          neural: [],
        },
      };
    }
  }
}
export default new GirlsFrontline2CharacterSearch();
