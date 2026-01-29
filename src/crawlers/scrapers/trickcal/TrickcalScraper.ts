import axios from 'axios';
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { prisma } from '../../../utils/prisma';

export class TrickcalScraper {
  private dbUrl =
    'https://raw.githubusercontent.com/voiderd-sub/trickcal-manager/main/db/master.db';
  private tempDbPath = path.join(
    process.cwd(),
    'assets',
    'temp',
    'trickcal.db',
  );

  /**
   * DB 파일 다운로드
   */
  async downloadDatabase(): Promise<void> {
    const tempDir = path.dirname(this.tempDbPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    console.log(`Downloading DB from ${this.dbUrl}...`);
    const response = await axios({
      url: this.dbUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    });

    fs.writeFileSync(this.tempDbPath, Buffer.from(response.data));
    console.log(`DB saved to ${this.tempDbPath}`);
  }

  /**
   * 스키마 분석 (테이블 목록 및 컬럼 확인용)
   */
  async analyzeSchema(): Promise<void> {
    if (!fs.existsSync(this.tempDbPath)) {
      console.error('DB file not found. Run downloadDatabase() first.');
      return;
    }

    const filebuffer = fs.readFileSync(this.tempDbPath);
    const SQL = await initSqlJs();
    const db = new SQL.Database(filebuffer);

    // 테이블 목록 조회
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (result.length === 0) {
      console.log('No tables found.');
      return;
    }

    // result[0].values is array of array of values [[name1], [name2], ...]
    const tables = result[0].values.map((v: any[]) => v[0]);
    console.log('--- Tables ---');
    console.log(tables.join(', '));

    for (const tableName of tables) {
      console.log(`\n[Table: ${tableName}]`);
      // Columns
      const cols = db.exec(`PRAGMA table_info(${tableName})`);
      if (cols.length > 0) {
        // cols[0].columns might be ["cid", "name", "type", ...]
        // cols[0].values is rows.
        // We want name (index 1) and type (index 2) usually
        const nameIdx = cols[0].columns.indexOf('name');
        const typeIdx = cols[0].columns.indexOf('type');

        const colDefs = cols[0].values.map(
          (v: any[]) => `${v[nameIdx]} (${v[typeIdx]})`,
        );
        console.log(colDefs.join(', '));
      }

      // Sample
      const sample = db.exec(`SELECT * FROM ${tableName} LIMIT 1`);
      if (sample.length > 0) {
        // Convert to object for nicer printing
        const columns = sample[0].columns;
        const row = sample[0].values[0] as any[];
        const obj: any = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        console.log('Sample:', JSON.stringify(obj, null, 2));
      }
    }

    db.close();
  }

  async scrape(): Promise<void> {
    if (!fs.existsSync(this.tempDbPath)) {
      await this.downloadDatabase();
    }

    const filebuffer = fs.readFileSync(this.tempDbPath);
    const SQL = await initSqlJs();
    const db = new SQL.Database(filebuffer);

    // 1. Game 생성/조회
    const game = await prisma.game.upsert({
      where: { slug: 'trickcal' },
      update: {},
      create: {
        slug: 'trickcal',
        name: '트릭컬 리바이브',
        iconUrl: 'https://trickcal.pstatic.net/naver/common/og/og_trickcal.jpg', // 임시 이미지
      },
    });

    console.log(`Game: ${game.name} (${game.id})`);

    // 2. 매핑 테이블 로드
    const personalityMap = this.getTableMap(db, 'personality', 'comment'); // 속성 (Element)
    const classMap = this.getTableMap(db, 'class', 'comment'); // 직업 (Type?)
    const raceMap = this.getTableMap(db, 'race', 'comment'); // 종족

    // 3. 캐릭터 스크래핑 (Hero)
    const heroes = this.getTableData(db, 'hero');
    let charCount = 0;

    for (const hero of heroes) {
      // Validation
      if (!hero.name_kr) continue;

      const rarity = hero.star_intrinsic || 1; // 1~3성
      const element = personalityMap.get(hero.personality) || 'Unknown';
      const position = classMap.get(hero.class) || 'Unknown';

      // Element upsert (Type: 'Personality')
      let elementObj = await prisma.element.findFirst({
        where: { gameId: game.id, name: element, type: 'Personality' },
      });
      if (!elementObj) {
        elementObj = await prisma.element.create({
          data: { gameId: game.id, name: element, type: 'Personality' },
        });
      }

      const race = raceMap.get(hero.race) || '';

      // Check exist
      const existingChar = await prisma.character.findFirst({
        where: {
          gameId: game.id,
          name: hero.name_kr,
        },
      });

      const charData = {
        gameId: game.id,
        name: hero.name_kr,
        rarity: rarity,
        elementId: elementObj.id,
        imageUrl: '',
        metadata: {
          name_en: hero.name_en,
          race: race,
          class: position,
          attack_type: hero.attack_type,
        },
      };

      if (existingChar) {
        await prisma.character.update({
          where: { id: existingChar.id },
          data: charData,
        });
      } else {
        await prisma.character.create({
          data: charData,
        });
      }
      charCount++;
    }
    console.log(`Processed ${charCount} characters.`);

    // 4. 아이템 스크래핑 (Equipment)
    const equipments = this.getTableData(db, 'equipment');
    let itemCount = 0;

    for (const equip of equipments) {
      if (!equip.name || equip.name === '[정보 없음]') continue;

      const itemData = {
        gameId: game.id,
        name: equip.name,
        rarity: equip.rank || 1,
        type: 'Equipment',
        imageUrl: '',
        metadata: {
          originalId: equip.id,
          typeId: equip.type,
        },
      };

      const existingItem = await prisma.item.findFirst({
        where: {
          gameId: game.id,
          name: equip.name,
        },
      });

      if (existingItem) {
        await prisma.item.update({
          where: { id: existingItem.id },
          data: itemData,
        });
      } else {
        await prisma.item.create({
          data: itemData,
        });
      }
      itemCount++;
    }
    console.log(`Processed ${itemCount} items.`);

    db.close();
  }

  // Helper to load table as array of objects
  private getTableData(db: any, tableName: string): any[] {
    const res = db.exec(`SELECT * FROM ${tableName}`);
    if (res.length === 0) return [];
    const columns = res[0].columns;
    const values = res[0].values;
    return values.map((row: any[]) => {
      const obj: any = {};
      columns.forEach((col: string, idx: number) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }

  // Helper to create ID -> Value map
  private getTableMap(
    db: any,
    tableName: string,
    valueCol: string,
  ): Map<number, string> {
    const rows = this.getTableData(db, tableName);
    const map = new Map<number, string>();
    for (const row of rows) {
      if (row.id && row[valueCol]) {
        map.set(row.id, row[valueCol]);
      }
    }
    return map;
  }

  async runAnalysis(): Promise<void> {
    await this.downloadDatabase();
    await this.analyzeSchema();
  }

  async exportDbAnalysis(): Promise<void> {
    if (!fs.existsSync(this.tempDbPath)) {
      await this.downloadDatabase();
    }

    const filebuffer = fs.readFileSync(this.tempDbPath);
    const SQL = await initSqlJs();
    const db = new SQL.Database(filebuffer);

    const analysisResult: any = {};

    // Get Tables
    const tablesRes = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    if (tablesRes.length > 0) {
      const tables = tablesRes[0].values.map((v: any[]) => v[0] as string);

      for (const tableName of tables) {
        const tableInfo: any = {
          columns: [],
          samples: [],
        };

        // Get Columns
        const colsRes = db.exec(`PRAGMA table_info(${tableName})`);
        if (colsRes.length > 0) {
          const nameIdx = colsRes[0].columns.indexOf('name');
          const typeIdx = colsRes[0].columns.indexOf('type');
          tableInfo.columns = colsRes[0].values.map((v: any[]) => ({
            name: v[nameIdx],
            type: v[typeIdx],
          }));
        }

        // Get Samples
        const samplesRes = db.exec(`SELECT * FROM ${tableName} LIMIT 5`);
        if (samplesRes.length > 0) {
          const columns = samplesRes[0].columns;
          tableInfo.samples = samplesRes[0].values.map((row: any[]) => {
            const obj: any = {};
            columns.forEach((col, idx) => {
              obj[col] = row[idx];
            });
            return obj;
          });
        }

        analysisResult[tableName] = tableInfo;
      }
    }

    db.close();

    const outputPath = path.join(process.cwd(), 'trickcal_db_analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(analysisResult, null, 2));
    console.log(`Analysis saved to ${outputPath}`);
  }
}
