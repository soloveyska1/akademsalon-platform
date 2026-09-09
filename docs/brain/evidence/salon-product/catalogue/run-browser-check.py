from pathlib import Path
import subprocess,sys
name=sys.argv[1]
base=Path(__file__).resolve().parent
s=(base/(name+'.js')).read_text().replace("u.endsWith('/sw.js')", "/\\/sw\\.js(?:\\?|$)/.test(u)")
wrapped='''async initial=>{const context=await initial.context().browser().newContext({serviceWorkers:'block'});const page=await context.newPage();try{await page.route('**/*',r=>{const u=r.request().url();if(u.includes('akademsalon.ru/api/'))return r.fulfill({json:{ok:true,authenticated:false,orders:[]}});if(!u.startsWith('http://127.0.0.1:8769/'))return r.abort();if(/\\/sw\\.js(?:\\?|$)/.test(u))return r.fulfill({body:'',contentType:'application/javascript'});return r.continue()});await page.goto('http://127.0.0.1:8769/');return {browser:context.browser().version(),serviceWorkers:'block',result:await ('''+s+''')(page)}}finally{await context.close()}}'''
(base/(name+'-isolated.js')).write_text(wrapped)
r=subprocess.run(['/Users/saymurrbk.ru/.codex/skills/playwright/scripts/playwright_cli.sh','-s=salon-catalog','run-code',wrapped],capture_output=True,text=True)
(base/(name+'-result.txt')).write_text(r.stdout+r.stderr);print(r.stdout.split('### Ran Playwright code')[0])
