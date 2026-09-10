const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),path=require('node:path');
const root=process.env.SALON_PUBLIC_ROOT||path.resolve(__dirname,'..');
const docs=['oferta','privacy','terms','refunds','requisites','academic-integrity','loyalty','consent','consent-request','consent-analytics','consent-marketing','consent-publication'];
for(const name of docs)test(name+': legal text, edition, anchors and destinations survive presentation change',()=>{const before=execFileSync('git',['show','045181e4:'+name+'.html'],{encoding:'utf8'}),after=fs.readFileSync(path.join(root,name+'.html'),'utf8');const article=s=>s.match(/<article class="doc">[\s\S]*?<\/article>/)[0]; // builder fingerprints CSS/JS, not document links
 assert.equal(article(after),article(before));assert.match(after,/data-legal-reader/);assert.doesNotMatch(after,/<script[^>]+polish15-reading/);assert.match(after,/salon-legal\.js/);});
