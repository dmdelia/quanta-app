import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const output=path.resolve('release-dist');
fs.mkdirSync(output,{recursive:true});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const installers=files('installers').filter(file=>/\.(exe|dmg|zip)$/.test(file));
if(!installers.some(file=>file.endsWith('-Setup.exe'))||!installers.some(file=>file.endsWith('.dmg'))||!installers.some(file=>file.endsWith('.app.zip')))throw Error('Both platform distributions are required for a release.');
for(const file of installers)fs.copyFileSync(file,path.join(output,path.basename(file)));
for(const file of files('plugins/examples').filter(file=>file.endsWith('.qplugin')))fs.copyFileSync(file,path.join(output,path.basename(file)));
execFileSync('git',['archive','--format=zip','--prefix=QUANTA/','--output',path.join(output,'QUANTA-source.zip'),'HEAD']);
const sums=fs.readdirSync(output).sort().map(name=>`${createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex')}  ${name}`);
fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),sums.join('\n')+'\n');
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
fs.writeFileSync('release-notes.md',`QUANTA ${version} — personal scientific notebook\n\nApple Silicon: download the .dmg, or the .app.zip archive. Windows x64: download the Setup.exe. Installers include the desktop TeX engine and its verified core scientific cache. Local writing needs no environment file.\n\nThis is a preview build. CI covers browser writing and exports, platform core tests, offline core TeX compilation, native packaging, and a launch smoke check. Interactive installation, Google authorization, and two-device Drive sync remain acceptance checks.\n\nThe Mac build is ad-hoc signed, without Apple notarization. The Windows installer has no trusted publisher signature. Google Drive needs your OAuth registration configured once in the app. Full LibreOffice file-format compatibility is not implemented. See docs/VALIDATION.md and docs/compatibility.md.\n\nSource commit: ${process.env.GITHUB_SHA||'local'}\n`);
