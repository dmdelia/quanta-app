import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory=path.resolve('public/tex');fs.mkdirSync(directory,{recursive:true});
const worker=path.join(directory,'swiftlatexpdftex.js');const wasm=path.join(directory,'swiftlatexpdftex.wasm');
if(!fs.existsSync(worker)||!fs.existsSync(wasm)){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'quanta-web-tex-'));const archive=path.join(temp,'swiftlatex.zip');
  try{
    execFileSync('curl',['--fail','--location','--retry','3','--max-time','120','--silent','--show-error','https://github.com/SwiftLaTeX/SwiftLaTeX/releases/download/v20022022/20-02-2022.zip','--output',archive],{stdio:'inherit'});
    if(os.platform()==='win32')execFileSync('powershell',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${archive.replace(/'/g,"''")}' -DestinationPath '${temp.replace(/'/g,"''")}' -Force`],{stdio:'inherit'});
    else execFileSync('unzip',['-q',archive,'swiftlatexpdftex.js','swiftlatexpdftex.wasm','-d',temp],{stdio:'inherit'});
    for(const file of ['swiftlatexpdftex.js','swiftlatexpdftex.wasm'])fs.copyFileSync(path.join(temp,file),path.join(directory,file));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(!WebAssembly.validate(fs.readFileSync(wasm)))throw Error('The browser TeX engine is not valid WebAssembly.');
const format=path.join(directory,'swiftlatexpdftex.fmt');
if(!fs.existsSync(format))execFileSync('curl',['--fail','--location','--retry','3','--max-time','120','--silent','--show-error','https://raw.githubusercontent.com/SwiftLaTeX/Texlive-Ondemand/master/swiftlatexpdftex.fmt','--output',format],{stdio:'inherit'});
if(createHash('sha256').update(fs.readFileSync(format)).digest('hex')!=='3134ef8cbfa829780fc0b63b5320fb680e8f895f0c7f48ecb82af159098760ec')throw Error('The pinned browser TeX format checksum does not match.');
fs.writeFileSync(path.join(directory,'NOTICE.txt'),'SwiftLaTeX PDFTeX WebAssembly engine, release v20022022.\nCopyright (C) 2019 Elliott Wen and upstream TeX contributors.\nEngine wrapper: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0.\nUpstream source and license notices: https://github.com/SwiftLaTeX/SwiftLaTeX/tree/v20022022\n\nThe PDFTeX format is bundled from SwiftLaTeX/Texlive-Ondemand with SHA-256 3134ef8cbfa829780fc0b63b5320fb680e8f895f0c7f48ecb82af159098760ec.\n\nThese vendor files are separate from QUANTA application source. Preserve all embedded copyright notices.\n');
console.log('Prepared the pinned browser TeX worker. It loads only when compiling.');
