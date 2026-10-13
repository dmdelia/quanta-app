export async function compileWebTex(source:string):Promise<{data:string;log:string}>{
  if(source.length>2*1024*1024)throw new Error('TeX source exceeds 2 MB.');
  const url=new URL('./tex/swiftlatexpdftex.js',document.baseURI);
  const worker=new Worker(url,{name:'quanta-browser-tex'});
  const wait=(compile:boolean)=>new Promise<{pdf?:ArrayBuffer;log?:string;result:string;status?:number}>((resolve,reject)=>{
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Browser TeX reached the two-minute limit. Your source is still saved.'));},120000);
    worker.onmessage=(e:MessageEvent)=>{const data=e.data;if(compile&&data.cmd!=='compile')return;clearTimeout(timeout);resolve(data);};
    worker.onerror=()=>{clearTimeout(timeout);reject(new Error('The browser TeX worker could not start. Reload QUANTA online so the engine assets can be cached.'));};
  });
  try{
    const ready=await wait(false);if(ready.result!=='ok')throw new Error('The browser TeX engine could not initialize.');
    worker.postMessage({cmd:'writefile',url:'paper.tex',src:source});worker.postMessage({cmd:'setmainfile',url:'paper.tex'});
    const promise=wait(true);worker.postMessage({cmd:'compilelatex'});const result=await promise;
    if(result.result!=='ok'||!result.pdf)throw new Error('TeX compilation failed. Your source is still saved.\n\n'+(result.log??'Check the package connection and TeX syntax.'));
    const bytes=new Uint8Array(result.pdf);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {data:btoa(binary),log:result.log??''};
  }finally{worker.terminate();}
}
