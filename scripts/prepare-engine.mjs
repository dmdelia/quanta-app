import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// Pinned upstream release; bundled into each installer. No TeX install on the user's computer.
const version='0.17.0';
const targets={darwin:os.arch()==='arm64'?'aarch64-apple-darwin':'x86_64-apple-darwin',win32:'x86_64-pc-windows-msvc',linux:'x86_64-unknown-linux-gnu'};
const target=process.argv[2]||targets[os.platform()];
if(!target)throw Error('Unsupported host. Pass a Tauri target triple.');
const upstream=target==='x86_64-pc-windows-msvc'?target:target;
const windows=target.includes('windows');const ext=windows?'zip':'tar.gz';
const name=`tectonic-${version}-${upstream}.${ext}`;
const url=`https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${version}/${name}`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'quanta-engine-'));
const archive=path.join(temp,name);const destination=path.resolve('src-tauri/binaries');
fs.mkdirSync(destination,{recursive:true});
try {
  execFileSync('curl',['--fail','--location','--retry','3','--max-time','120','--silent','--show-error',url,'--output',archive],{stdio:'inherit'});
  if(windows&&os.platform()==='win32')execFileSync('powershell',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${archive.replace(/'/g,"''")}' -DestinationPath '${temp.replace(/'/g,"''")}' -Force`],{stdio:'inherit'});
  else if(windows)execFileSync('unzip',['-q',archive,'-d',temp],{stdio:'inherit'});
  else execFileSync('tar',['--no-same-owner','-xzf',archive,'-C',temp],{stdio:'inherit'});
  function find(dir,filename){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){const result=find(p,filename);if(result)return result;}else if(e.name===filename)return p;}}
  const engine=find(temp,windows?'tectonic.exe':'tectonic');if(!engine)throw Error('The release did not contain Tectonic.');
  const output=path.join(destination,`tectonic-${target}${windows?'.exe':''}`);fs.copyFileSync(engine,output);if(!windows)fs.chmodSync(output,0o755);
  const cache=path.resolve('src-tauri/resources/tex-cache');fs.mkdirSync(cache,{recursive:true});
  const seed=path.join(temp,'warmup.tex');fs.writeFileSync(seed,String.raw`\documentclass{article}
\usepackage{amsmath,amssymb,mathtools,graphicx,booktabs,siunitx,tikz,hyperref}
\begin{document}
\[\frac{\partial f}{\partial x}+\int_0^1 x^2\,dx\]
\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}
\end{document}`);
  if(target===targets[os.platform()]) {
    execFileSync(output,['--untrusted','--outdir',temp,seed],{stdio:'inherit',env:{...process.env,TECTONIC_CACHE_DIR:cache},timeout:240000});
  }
  console.log(`Bundled Tectonic ${version} for ${target}; core scientific packages cached.`);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
