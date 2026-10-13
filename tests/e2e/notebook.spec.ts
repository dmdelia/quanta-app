import { test,expect,type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import {createCanvas} from '@napi-rs/canvas';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
async function start(page:Page){
  await page.goto('/');await page.getByLabel('Choose a password').fill('testing-quanta-2026');await page.getByLabel('Confirm password').fill('testing-quanta-2026');await page.getByRole('button',{name:'Create my workspace'}).click();await page.getByRole('button',{name:'Skip tutorial'}).click();await expect(page.getByLabel('Notebook title')).toHaveValue('A little space to think');
}
test('notes survive reload and the password gate',async({page})=>{
  await start(page);await page.getByRole('button',{name:'New notebook',exact:true}).click();await page.getByLabel('Notebook title').fill('A durable experiment');await page.getByRole('textbox',{name:'Notebook editor',exact:true}).fill('Measured acceleration: 9.81 metres per second squared.');await page.keyboard.press('Control+s');await expect(page.getByText('Saved on this computer',{exact:true})).toBeVisible();await page.reload();await page.getByLabel('Password',{exact:true}).fill('testing-quanta-2026');await page.getByRole('button',{name:'Unlock QUANTA'}).click();await expect(page.getByLabel('Notebook title')).toHaveValue('A durable experiment');await expect(page.getByRole('textbox',{name:'Notebook editor'})).toContainText('Measured acceleration');
});
test('equations, themes, focus mode, and export work',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await start(page);await page.getByRole('button',{name:'Insert equation',exact:true}).click();await page.getByLabel('LaTeX source',{exact:true}).fill('\\frac{a}{b}');await page.getByRole('dialog',{name:'Write an equation'}).getByRole('button',{name:'Insert equation',exact:true}).click();await expect(page.locator('math-field')).toHaveCount(3);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Graphite',exact:false}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','graphite');await page.getByRole('button',{name:'Close Make QUANTA yours'}).click();await page.getByRole('button',{name:'Enter focus mode'}).click();await expect(page.locator('.sidebar')).not.toBeVisible();await page.getByRole('button',{name:'Exit focus mode'}).click();await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:'Markdown',exact:false}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export MD'}).click();expect((await download).suggestedFilename()).toMatch(/\.md$/);expect(errors).toEqual([]);
});
test('math macros and finished PDF/PNG exports work',async({page},testInfo)=>{
  test.setTimeout(90000);
  await start(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Writing',exact:true}).click();
  await page.getByLabel('Custom math macros (JSON)').fill(JSON.stringify({'\\RR':'\\mathbb{R}'}));
  await page.getByRole('button',{name:'Apply macros',exact:true}).click();
  await page.getByRole('button',{name:'Close Make QUANTA yours'}).click();
  await page.getByRole('button',{name:'Insert equation',exact:true}).click();
  await page.getByLabel('LaTeX source',{exact:true}).fill('x \\in \\RR');
  await page.getByRole('dialog',{name:'Write an equation'}).getByRole('button',{name:'Insert equation',exact:true}).click();
  await expect(page.locator('math-field')).toHaveCount(3);
  await expect.poll(()=>page.locator('math-field').evaluateAll(fields=>fields.map(el=>(el as HTMLElement&{getValue:(format:string)=>string}).getValue('latex-expanded')).join(' '))).toContain('\\mathbb{R}');
  await page.screenshot({path:testInfo.outputPath('quanta-notebook.png'),fullPage:true});
  for(const [format,label,signature] of [['pdf','PDF','%PDF-'],['png','PNG','PNG']] as const){
    await page.getByRole('button',{name:'Export',exact:true}).click();
    await page.getByRole('button',{name:new RegExp('^'+label+' ')}).click();
    const downloading=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export '+label,exact:true}).click();
    const download=await downloading;
    const file=testInfo.outputPath('scientific-note.'+format);
    await download.saveAs(file);
    const bytes=await fs.readFile(file);
    expect(bytes.length).toBeGreaterThan(2000);
    expect(bytes.subarray(format==='png'?1:0,format==='png'?4:5).toString()).toBe(signature);
    if(format==='pdf'){
      const task=getDocument({data:new Uint8Array(bytes),standardFontDataUrl:process.cwd()+'/node_modules/pdfjs-dist/standard_fonts/'});
      const pdf=await task.promise;
      try{
        for(let number=1;number<=pdf.numPages;number++){
          const page=await pdf.getPage(number);const viewport=page.getViewport({scale:0.7});
          const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
          const context=canvas.getContext('2d');
          await page.render({canvas:canvas as unknown as HTMLCanvasElement,canvasContext:context as unknown as CanvasRenderingContext2D,viewport}).promise;
          const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
          let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<200&&pixels[i+1]<200&&pixels[i+2]<200)ink++;
          expect(ink,`PDF page ${number} should contain document content`).toBeGreaterThan(400);
        }
      }finally{await task.destroy();}
    }
    if(format==='png'){
      const ink=await page.evaluate(async data=>{
        const image=new Image();image.src=data;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<200&&pixels[i+1]<200&&pixels[i+2]<200&&pixels[i+3]>200)count++;
        return count;
      },'data:image/png;base64,'+bytes.toString('base64'));
      expect(ink).toBeGreaterThan(1000);
    }
  }
});
