import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';

async function start(page:Page){
  await page.goto('./');
  await page.getByLabel('Choose a password').fill('testing-quanta-web');
  await page.getByLabel('Confirm password').fill('testing-quanta-web');
  await page.getByRole('button',{name:'Create my workspace'}).click();
  await page.getByRole('button',{name:'Skip tutorial'}).click();
  await expect(page.getByRole('textbox',{name:'Notebook editor'})).toBeVisible();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}

test('the Pages subpath reloads offline and worker plugins edit the notebook',async({page,context},testInfo)=>{
  await start(page);
  await page.getByLabel('Notebook title').fill('A notebook from the web');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Plugins',exact:true}).click();
  const choosing=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Install plugin',exact:true}).click();
  await (await choosing).setFiles('plugins/examples/experiment-template.qplugin');
  await page.getByRole('checkbox',{name:'Enabled',exact:true}).check();
  await page.getByRole('button',{name:'Close Make QUANTA yours'}).click();
  await page.getByRole('button',{name:'Open command palette'}).click();
  await page.getByRole('button',{name:/Insert experiment structure/}).click();
  await expect(page.getByRole('textbox',{name:'Notebook editor'})).toContainText('What would falsify the result?');
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved on this computer',{exact:true})).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Password',{exact:true}).fill('testing-quanta-web');
  await page.getByRole('button',{name:'Unlock QUANTA'}).click();
  await expect(page.getByLabel('Notebook title')).toHaveValue('A notebook from the web');
  await expect(page.getByRole('textbox',{name:'Notebook editor'})).toContainText('What would falsify the result?');
  await page.screenshot({path:testInfo.outputPath('quanta-web-offline.png'),fullPage:true});
});

test('the browser TeX worker compiles a real PDF',async({page},testInfo)=>{
  test.setTimeout(240000);
  await start(page);
  await page.getByRole('button',{name:'LaTeX',exact:true}).click();
  await page.getByLabel('LaTeX document source').fill(String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
QUANTA browser typesetting.
\[\int_0^1 x^2\,dx=\frac{1}{3}\]
\end{document}`);
  await page.getByRole('button',{name:'Compile PDF',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save PDF',exact:true})).toBeVisible({timeout:130000});
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Save PDF',exact:true}).click();
  const download=await downloading;
  const file=testInfo.outputPath('browser-tex.pdf');
  await download.saveAs(file);
  expect((await fs.readFile(file)).subarray(0,5).toString()).toBe('%PDF-');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByRole('button',{name:/^PNG /}).click();
  const exporting=page.waitForEvent('download',{timeout:130000});
  await page.getByRole('button',{name:'Export PNG',exact:true}).click();
  const png=await exporting;const image=testInfo.outputPath('browser-tex.png');await png.saveAs(image);
  expect((await fs.readFile(image)).subarray(1,4).toString()).toBe('PNG');
});
