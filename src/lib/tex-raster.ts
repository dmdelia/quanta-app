import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export async function pdfToPng(bytes:Uint8Array,pixelRatio:number):Promise<Uint8Array>{
  const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  GlobalWorkerOptions.workerSrc=workerUrl;
  const task=getDocument({data:bytes.slice(),
    wasmUrl:new URL('./pdfjs/wasm/',document.baseURI).href,
    standardFontDataUrl:new URL('./pdfjs/standard_fonts/',document.baseURI).href});
  try{
    const pdf=await task.promise;
    if(pdf.numPages>200)throw new Error('Split documents above 200 pages before image export.');
    const widths=794*pixelRatio;const dimensions:{scale:number;height:number}[]=[];
    let height=0;
    for(let number=1;number<=pdf.numPages;number++){
      const page=await pdf.getPage(number);const base=page.getViewport({scale:1});
      const scale=widths/base.width;const h=Math.ceil(base.height*scale);
      dimensions.push({scale,height:h});height+=h;
    }
    if(height>32000||widths*height>64_000_000)throw new Error('This document is too long for one PNG. Export PDF or lower the image resolution.');
    const canvas=document.createElement('canvas');canvas.width=widths;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image rendering is unavailable.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    let offset=0;
    for(let number=1;number<=pdf.numPages;number++){
      const page=await pdf.getPage(number);const size=dimensions[number-1];
      const part=document.createElement('canvas');part.width=widths;part.height=size.height;
      await page.render({canvas:part,viewport:page.getViewport({scale:size.scale})}).promise;
      context.drawImage(part,0,offset);offset+=size.height;
      part.width=0;part.height=0;page.cleanup();
    }
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG encoding failed.')),'image/png'));
    canvas.width=0;canvas.height=0;return new Uint8Array(await blob.arrayBuffer());
  }finally{await task.destroy();}
}
