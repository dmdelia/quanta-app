import fs from 'node:fs';
import path from 'node:path';

const source=path.resolve('node_modules/pdfjs-dist');
const output=path.resolve('public/pdfjs');
for(const folder of ['wasm','standard_fonts']){
  fs.mkdirSync(path.join(output,folder),{recursive:true});
  fs.cpSync(path.join(source,folder),path.join(output,folder),{recursive:true});
}
fs.copyFileSync(path.join(source,'LICENSE'),path.join(output,'LICENSE.txt'));
