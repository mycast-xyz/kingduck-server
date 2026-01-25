import fs from 'fs';

const content = fs.readFileSync('reverse1999_detail_59.html', 'utf8');
const matches = content.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/g);
let output = '';
for (const match of matches) {
  let part = match[1];
  // Unescape the string
  part = part
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\u(....)/g, (match, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    );
  output += part + '\n---\n';
}
fs.writeFileSync('reverse1999_extracted_data.txt', output);
console.log('Extracted data to reverse1999_extracted_data.txt');
