import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import katexCss from 'katex/dist/katex.min.css?inline';
import { backend, native } from './backend';
import { exportBody, exportCss, nodeMarkdown, notebookTex, textContent } from './document';
import type { Notebook, Settings, ExportFormat, ExportTarget } from './types';

export const mimeTypes: Record<ExportFormat,string> = {pdf:'application/pdf',png:'image/png',svg:'image/svg+xml',md:'text/markdown',tex:'application/x-tex',html:'text/html',txt:'text/plain'};
export const safeFilename = (title: string) => (title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[ .]+$/g,'').trim() || 'Scientific note').slice(0,150);
export function bytesToBase64(bytes: Uint8Array): string {
  let result = ''; for(let i=0;i<bytes.length;i+=32768) result += String.fromCharCode(...bytes.subarray(i,i+32768)); return btoa(result);
}
export function base64ToBytes(data: string): Uint8Array { return Uint8Array.from(atob(data),c=>c.charCodeAt(0)); }
const blobBytes = async(blob:Blob)=>new Uint8Array(await blob.arrayBuffer());
const canvasBlob = (canvas:HTMLCanvasElement)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image export failed.')),'image/png'));

export async function renderExport(note: Notebook, settings: Settings, format: ExportFormat): Promise<Uint8Array> {
  if(format==='md') return new TextEncoder().encode(`# ${note.title}\n\n${nodeMarkdown(note.content)}`);
  if(format==='txt') return new TextEncoder().encode(`${note.title}\n\n${textContent(note.content)}`);
  if(format==='tex') return new TextEncoder().encode(note.texSource || notebookTex(note,settings));
  const {toCanvas,toSvg,getFontEmbedCSS}=await import('html-to-image');
  if(format==='html') {
    // Embed the fonts so the exported HTML is entirely independent of QUANTA.
    const container=makeExportNode(note,settings); document.body.append(container);
    try {
      const fonts=await getFontEmbedCSS(container);
      return new TextEncoder().encode(`<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${safeFilename(note.title)}</title><style>${exportCss}\n${katexCss}\n${fonts}</style></head><body><article>${exportBody(note,settings)}</article></body></html>`);
    } finally {container.remove();}
  }
  const article=makeExportNode(note,settings); document.body.append(article);
  try {
    await document.fonts.ready;
    const width=794; const pageHeight=settings.paperSize==='letter'?1028:1123;
    const height=article.scrollHeight;
    if(format==='svg') {
      const uri=await toSvg(article,{width,height,backgroundColor:'#ffffff'});
      const blob=await(await fetch(uri)).blob(); return blobBytes(blob);
    }
    if(format==='png') {
      if(height*settings.exportScale>32000 || width*height*settings.exportScale**2>64_000_000) throw new Error('This notebook is too long for one PNG. Export a paginated PDF or reduce PNG resolution in Settings.');
      return blobBytes(await canvasBlob(await toCanvas(article,{pixelRatio:settings.exportScale,width,height,backgroundColor:'#ffffff',preferredFontFormat:'woff2'})));
    }
    const {jsPDF}=await import('jspdf');
    const pdf=new jsPDF({orientation:'portrait',unit:'px',format:settings.paperSize==='letter'?'letter':'a4',hotfixes:['px_scaling']});
    const pdfW=pdf.internal.pageSize.getWidth(); const pdfH=pdf.internal.pageSize.getHeight();
    const cuts=pageCuts(article,pageHeight); const fonts=await getFontEmbedCSS(article,{preferredFontFormat:'woff2'});
    for(let page=0;page<cuts.length-1;page++) {
      const start=cuts[page]; const span=cuts[page+1]-start;
      const viewport=document.createElement('div'); viewport.style.cssText=`width:${width}px;height:${pageHeight}px;overflow:hidden;background:white;position:relative;`;
      const clone=article.cloneNode(true) as HTMLElement; clone.style.position='relative';clone.style.left='0';clone.style.top=`-${start}px`;
      viewport.append(clone);
      // html-to-image can render detached trees, provided dimensions are explicit.
      const canvas=await toCanvas(viewport,{width,height:pageHeight,pixelRatio:settings.exportScale,backgroundColor:'#ffffff',fontEmbedCSS:fonts});
      // Blank out the area below this page's cut, otherwise the next line would repeat.
      const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,span*settings.exportScale,canvas.width,canvas.height-span*settings.exportScale);
      if(page>0)pdf.addPage();
      pdf.addImage(canvas,'PNG',0,0,pdfW,pdfH,undefined,'FAST');
      pdf.setFontSize(8);pdf.setTextColor(130);pdf.text(`${page+1} / ${cuts.length-1}`,pdfW/2,pdfH-12,{align:'center'});
      canvas.width=0;canvas.height=0;
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    pdf.setProperties({title:note.title,author:settings.author,creator:'QUANTA'}); return new Uint8Array(pdf.output('arraybuffer'));
  } finally {article.remove();}
}
function makeExportNode(note:Notebook,settings:Settings):HTMLElement {
  const article=document.createElement('article');article.className='quanta-export';
  article.style.cssText='width:794px;box-sizing:border-box;padding:48px;background:#fff;color:#172331;position:absolute;left:-10000px;top:0;font:16px/1.7 Georgia,serif;';
  const style=document.createElement('style');style.textContent=exportCss.replace(/body\{/g,'.quanta-export{').replace(/article\{/g,'.quanta-export{')+katexCss;
  article.append(style);const content=document.createElement('div');content.innerHTML=exportBody(note,settings);article.append(content);return article;
}
function pageCuts(article:HTMLElement,pageHeight:number):number[] {
  const top=article.getBoundingClientRect().top;const height=article.scrollHeight;const boundaries:number[]=[];
  article.querySelectorAll('p,li,tr,h1,h2,h3,blockquote,pre,figure,.equation').forEach(el=> {
    const rect=el.getBoundingClientRect();boundaries.push(rect.bottom-top+10);
    // Long paragraphs can span a page. Text ranges give line boundaries without cutting letters.
    if(rect.height>pageHeight-180) {
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let text:Node|null;
      while((text=walker.nextNode())) {const range=document.createRange();range.selectNodeContents(text);for(const line of range.getClientRects())boundaries.push(line.bottom-top+6);}
    }
  });
  boundaries.sort((a,b)=>a-b);const cuts=[0];let start=0;
  while(start+pageHeight<height) {
    const end=start+pageHeight-32;const candidates=boundaries.filter(y=>y>start+pageHeight*0.45&&y<=end);
    const cut=candidates.at(-1)??end;cuts.push(cut);start=cut;
    if(cuts.length>200)throw new Error('This export exceeds 200 pages. Split the notebook into smaller documents.');
  }
  cuts.push(Math.max(height,start+1));return cuts;
}

export async function exportNotebook(note:Notebook,settings:Settings,format:ExportFormat,target:ExportTarget,nameOverride?:string):Promise<string|null> {
  const name=(nameOverride?nameOverride.replace(new RegExp(`\\.${format}$`,'i'),''):safeFilename(note.title))+'.'+format;
  const bytes=await renderExport(note,settings,format);
  if(target==='drive'||target==='driveAs') {
    await backend.queueExport(name,bytesToBase64(bytes),mimeTypes[format],target==='drive');
    backend.syncNow().catch(()=>{});return 'Queued for Google Drive. QUANTA will retry if the connection is unavailable.';
  }
  if(native) {
    const key=`quanta.export.${note.id}.${format}`;let path=target==='local'?localStorage.getItem(key):null;
    if(!path)path=await saveDialog({title:'Export '+format.toUpperCase(),defaultPath:name,filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if(!path)return null;
    await backend.writeExport(path,bytesToBase64(bytes));localStorage.setItem(key,path);return 'Export saved.';
  }
  const url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:mimeTypes[format]}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return 'Export downloaded.';
}
