import fs from 'fs';
import path from 'path';

const DEBUG_FILE = path.join(process.cwd(), 'debug_post_full.json');

function processDebugContent() {
  try {
    const raw = fs.readFileSync(DEBUG_FILE, 'utf-8');
    const data = JSON.parse(raw);

    // The user pointed out 'structured_content'
    const structuredContentStr = data.structured_content;

    if (!structuredContentStr) {
      console.log('No structured_content found.');
      return;
    }

    const struct = JSON.parse(structuredContentStr);

    if (Array.isArray(struct)) {
      const fullContent = struct
        .map((node: any) => {
          if (typeof node.insert === 'string') {
            return node.insert;
          }
          return '';
        })
        .join('');

      console.log('--- Processed Content ---');
      console.log(fullContent);
      console.log('-------------------------');
    } else {
      console.log('structured_content is not an array.');
    }
  } catch (e) {
    console.error('Error processing debug file:', e);
  }
}

processDebugContent();
