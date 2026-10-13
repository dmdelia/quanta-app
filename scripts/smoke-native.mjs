import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';

const target=process.argv[2];
const release=path.resolve('src-tauri/target',target,'release');
const windows=target.includes('windows');
let executable;
if(windows) {
  const installer=fs.readdirSync('native-dist').find(file=>file.endsWith('-Setup.exe'));
  const destination=path.join(os.tmpdir(),'quanta-smoke-install');
  execFileSync(path.resolve('native-dist',installer),['/S',`/D=${destination}`],{stdio:'inherit',timeout:120000});
  executable=path.join(destination,'quanta.exe');
  if(!fs.existsSync(path.join(destination,'tectonic.exe')))throw Error('The installed application is missing its TeX engine.');
} else {
  const app=path.join(release,'bundle','macos','QUANTA.app','Contents');
  executable=path.join(app,'MacOS','quanta');
  if(!fs.existsSync(path.join(app,'MacOS','tectonic')))throw Error('The macOS bundle is missing its TeX engine.');
}
const child=spawn(executable,[],{cwd:path.dirname(executable),stdio:'inherit'});
await new Promise((resolve,reject)=>{
  const timer=setTimeout(resolve,10000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',(code,signal)=>{clearTimeout(timer);reject(Error(`QUANTA exited during launch: ${code??signal}.`));});
});
console.log('Native launch smoke check passed: application remained running for 10 seconds.');
child.kill();
// A process staying alive is a smoke check, not an interactive notebook or OAuth test.
