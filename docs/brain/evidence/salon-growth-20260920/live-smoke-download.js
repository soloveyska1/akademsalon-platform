async page => {
 const resultText=await page.locator('.gz-result').innerText();
 const downloadEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'Скачать план подготовки',exact:true}).click();
 const file=await downloadEvent;
 await file.saveAs('output/playwright/live-download-plan.txt');
 await page.evaluate(({resultText,name})=>Object.assign(window.__salonLiveSmoke,{resultText,downloadName:name,downloadConfirmed:true}),{resultText,name:file.suggestedFilename()});
}
