import NikkeCharacterQuery from './CharacterQuery';
import GameQuery from '../AllGame/GameQuery';

/**
 * 캐릭터 검색 관련 기능을 담당하는 클래스
 */
class NikkeCharacterSearch {
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
        if (type.key === 'manufacturerType') {
          typeOptions['type.manufacturer'] = type.value;
        }
        if (type.key === 'classType') {
          typeOptions['type.class'] = type.value;
        }
        if (type.key === 'weaponType') {
          typeOptions['type.weapon'] = type.value;
        }
        if (type.key === 'elementType') {
          typeOptions['type.element'] = type.value;
        }
        if (type.key === 'burstType') {
          typeOptions['type.burst'] = type.value;
        }
      });

      return typeOptions;
    };

    const typeOptions = setTypeOptions(typeConditions);

    // 게임의 타입(속성, 경로) 정보 조회
    const typeList = await GameQuery.getTypeList(gameData.id);

    // 캐릭터 기본 정보 목록 조회
    let characterList;
    if (typeOptions && Object.keys(typeOptions).length > 0) {
      characterList = await NikkeCharacterQuery.getCharacterListWithConditions(
        gameData.id,
        typeOptions,
        rarityOptions,
      );
    } else {
      characterList = await NikkeCharacterQuery.getCharacterList(gameData.id);
    }

    // 각 캐릭터에 속성과 경로 정보를 매핑
    const mappedCharacters = characterList.map((character: any) => ({
      ...character,
      // 캐릭터의 속성(element) 정보 매핑
      type: {
        burst: typeList.find(
          (typeItem: any) =>
            Number(typeItem.id) === Number(character.type.burst),
        ),
        class: typeList.find(
          (typeItem: any) =>
            Number(typeItem.id) === Number(character.type.class),
        ),
        weapon: typeList.find(
          (typeItem: any) =>
            Number(typeItem.id) === Number(character.type.weapon),
        ),
        element: typeList.find(
          (typeItem: any) =>
            Number(typeItem.id) === Number(character.type.element),
        ),
        manufacturer: typeList.find(
          (typeItem: any) =>
            Number(typeItem.id) === Number(character.type.manufacturer),
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
    // 캐릭터의 기본 정보 조회
    const characterData = await NikkeCharacterQuery.getCharacterDetail(id);
    if (!characterData) {
      throw new Error('Character not found');
    }

    // 캐릭터의 추가 정보(속성, 경로, 스킬, 이미지) 병렬 조회
    const [
      burstType,
      classType,
      weaponType,
      elementType,
      manufacturerType,
      skillData,
      images,
    ] = await NikkeCharacterQuery.getCharacterAdditionalInfo(
      characterData.type?.burst,
      characterData.type?.class,
      characterData.type?.weapon,
      characterData.type?.element,
      characterData.type?.manufacturer,
      id,
    );

    // 캐릭터의 장착 아이템 정보 조회
    const [[weaponItems]] = await Promise.all([
      NikkeCharacterQuery.getCharacterItems(characterData.info?.itemData),
    ]);

    // 응답 데이터 구성
    const responseData = {
      ...characterData,
      type: {
        burst: burstType,
        class: classType,
        weapon: weaponType,
        element: elementType,
        manufacturer: manufacturerType,
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
          document.querySelectorAll(
            'table[style="width:100%; border:2px solid #010101;"]',
          ),
        )
          .map((tr) => {
            const tds = tr.querySelectorAll('td[colspan="2"]');
            const contentItem = tds[0].querySelectorAll('div > div > dl ');
            const contentText = Array.from(contentItem).map((item) => {
              const dt = item.querySelector('dt');
              const dd = item.querySelector('dd');
              if (dt?.textContent?.includes('버스트')) {
                const characterListSelected =
                  dd?.querySelectorAll('div.SGcNubhZ > div');
                const characterList = Array.from(characterListSelected).map(
                  (item) => {
                    const tableList = item.querySelector(
                      'table > tbody > tr dl.yD8tVqU6',
                    );
                    const dataTitle = tableList?.querySelector('dt');
                    const dataTable = tableList?.querySelectorAll('dd');
                    const dataTableRow = Array.from(dataTable).map((item) => {
                      const aElements = item.querySelectorAll('a');
                      const aTexts = Array.from(aElements).map((a) => ({
                        text: a.textContent?.trim() || '',
                        href: a.getAttribute('href') || '',
                      }));
                      return aTexts;
                    });
                    return {
                      title: dataTitle?.textContent?.trim() || '',
                      content: dataTableRow[0] || '',
                    };
                  },
                );
                return {
                  title: dt?.textContent?.trim() || '',
                  content: characterList,
                };
              }
              return;
            });
            return contentText;
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
  async InfoNamuWikiSearch(page: any) {
    try {
      const references = await page.evaluate(() => {
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
        // 캐릭터 정보 추출
        let characterElements = Array.from(
          document.querySelectorAll('._15e43f06bd6ccb1ea94fc5bfcc2c4aeb') || [],
        )
          .map((tr) => {
            try {
              let nameElement = tr.querySelector(
                '._5d8010aedf0927244100ef4015403701[colspan="2"]',
              );
              if (!nameElement) {
                nameElement = tr.querySelector(
                  '._251a761b5f2f0b93bb1b535a64ccf340',
                );
                if (!nameElement) {
                  nameElement = tr.querySelector(
                    '._4bee8a2d34a0686ac83b8a877c0295a2[colspan="2"]',
                  );
                  if (!nameElement) {
                    return null;
                  }
                }
              }
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
              // 레어도 정보 추출
              let tds = Array.from(
                tr.querySelectorAll('td._5d8010aedf0927244100ef4015403701'),
              );

              if (tds.length < 2) {
                tds = Array.from(
                  tr.querySelectorAll('td._251a761b5f2f0b93bb1b535a64ccf340'),
                );
                if (tds.length < 2) {
                  tds = Array.from(
                    tr.querySelectorAll('td._4bee8a2d34a0686ac83b8a877c0295a2'),
                  );
                  if (tds.length < 2) {
                    return null;
                  }
                }
              }
              const trElements = Array.from(tds).map((td) => td.closest('tr'));

              // tr 데이터 추출
              const rarityData = CharacterInfoTableRows(trElements, '등급');
              const manufacturer = CharacterInfoTableRows(trElements, '제조사');
              const weapon = CharacterInfoTableRows(trElements, '무기');
              const element = CharacterInfoTableRows(trElements, '속성');
              const burst = CharacterInfoTableRows(trElements, '버스트');
              const modal = CharacterInfoTableRows(trElements, '클래스');
              const voice = CharacterInfoTableRows(trElements, '성우');

              return {
                name: {
                  kr: nameKr,
                  en: nameEn,
                },
                rarity: rarityData,
                manufacturer: manufacturer,
                weapon: weapon,
                element: element,
                burst: burst,
                modal: modal,
                voice: voice,
                length: tds.length,
              };
            } catch (err) {
              console.error('캐릭터 정보 추출 중 오류:', err);
              return null;
            }
          })
          .filter((item) => item !== null);

        if (characterElements.length === 0) {
          // 캐릭터 정보 추출
          characterElements = Array.from(
            document.querySelectorAll('._1c616e8548287a0cab8a3114c65a917d') ||
              [],
          )
            .map((tr) => {
              try {
                let nameElement = tr.querySelector(
                  '._5d8010aedf0927244100ef4015403701[colspan="2"]',
                );
                if (!nameElement) {
                  nameElement = tr.querySelector(
                    '._251a761b5f2f0b93bb1b535a64ccf340[colspan="2"]',
                  );
                  if (!nameElement) {
                    nameElement = tr.querySelector(
                      '._4bee8a2d34a0686ac83b8a877c0295a2[colspan="2"]',
                    );
                    if (!nameElement) {
                      return null;
                    }
                  }
                }
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
                // 레어도 정보 추출
                let tds = Array.from(
                  tr.querySelectorAll('td._5d8010aedf0927244100ef4015403701'),
                );

                if (tds.length === 0) {
                  tds = Array.from(
                    tr.querySelectorAll('td._251a761b5f2f0b93bb1b535a64ccf340'),
                  );
                  if (tds.length === 0) {
                    tds = Array.from(
                      tr.querySelectorAll(
                        'td._4bee8a2d34a0686ac83b8a877c0295a2',
                      ),
                    );
                    if (tds.length === 0) {
                      return null;
                    }
                  }
                }

                const trElements = Array.from(tds).map((td) =>
                  td.closest('tr'),
                );

                // tr 데이터 추출
                const rarityData = CharacterInfoTableRows(trElements, '등급');
                const manufacturer = CharacterInfoTableRows(
                  trElements,
                  '제조사',
                );
                const weapon = CharacterInfoTableRows(trElements, '무기');
                const element = CharacterInfoTableRows(trElements, '속성');
                const burst = CharacterInfoTableRows(trElements, '버스트');
                const modal = CharacterInfoTableRows(trElements, '클래스');
                const voice = CharacterInfoTableRows(trElements, '성우');

                return {
                  name: {
                    kr: nameKr,
                    en: nameEn,
                  },
                  rarity: rarityData,
                  manufacturer: manufacturer,
                  weapon: weapon,
                  element: element,
                  burst: burst,
                  modal: modal,
                  voice: voice,
                  length: tds.length,
                };
              } catch (err) {
                console.error('캐릭터 정보 추출 중 오류:', err);
                return null;
              }
            })
            .filter((item) => item !== null);
        }

        return characterElements;
      });
      return references;
    } catch (error) {
      console.error('데이터 추출 중 오류:', error);
      throw error;
    }
  }
}

export default new NikkeCharacterSearch();
