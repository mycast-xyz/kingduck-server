// 빌드 후 config JSON을 dist로 복사한다.
// tsc는 require()로 불러오는 .json을 outDir로 복사하지 않으므로(런타임 모듈 누락 방지) 별도 단계가 필요하다.
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'config');
const outDir = path.join(__dirname, '..', 'dist', 'config');

fs.mkdirSync(outDir, { recursive: true });

for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith('.json')) {
    fs.copyFileSync(path.join(srcDir, file), path.join(outDir, file));
    console.log(`copied config: ${file}`);
  }
}
