import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const target=process.argv[2];
if(!target)throw Error('Pass the native target triple.');
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const release=path.resolve('src-tauri/target',target,'release');
const output=path.resolve('native-dist');
fs.mkdirSync(output,{recursive:true});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
if(target.includes('windows')) {
  const installer=files(path.join(release,'bundle','nsis')).find(file=>file.endsWith('-setup.exe'));
  if(!installer)throw Error('Windows setup executable is missing.');
  fs.copyFileSync(installer,path.join(output,`QUANTA-${version}-Windows-x64-Setup.exe`));
} else if(target==='aarch64-apple-darwin') {
  const dmg=files(path.join(release,'bundle','dmg')).find(file=>file.endsWith('.dmg'));
  if(!dmg)throw Error('Apple Silicon disk image is missing.');
  fs.copyFileSync(dmg,path.join(output,`QUANTA-${version}-Apple-Silicon.dmg`));
  const app=path.join(release,'bundle','macos','QUANTA.app');
  execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
  // Archive on macOS before artifact upload, preserving executable bits and resources.
  execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,path.join(output,`QUANTA-${version}-Apple-Silicon.app.zip`)],{stdio:'inherit'});
} else throw Error('Unsupported distribution target.');
console.log('Prepared native distribution files.');
