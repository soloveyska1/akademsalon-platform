const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/js/salon-assistant-order.js'),'utf8');
const D=require('../assets/js/salon-assistant-order.js');
test('draft bridge permits only reviewed task hints, never consent, money or identity',()=>{
 const b=D.clean({product:'course',scope:'part',topic:'Test',deadline:'2026-12-20',contact:'do-not-transfer',name:'Private',consent:true,participation:true,price:1,id:99,token:'secret',files:['a.pdf']});
 assert.deepEqual(b,{product:'course',scope:'part',topic:'Test',deadline:'2026-12-20'});
 assert.deepEqual(D.clean({product:'javascript:alert(1)',scope:[],topic:{},deadline:'2026-02-31'}),{});
 assert.equal(D.clean({topic:'a'.repeat(900)}).topic.length,500);
});
test('origin, actual window and protocol version all bind messages',()=>{
 const parent={};for(const bad of [{origin:'https://other.test',source:parent},{origin:'https://site.test',source:{}},{origin:'https://site.test',source:parent,data:{version:2,type:'ready'}}])assert.equal(D.validEvent({data:{type:'ready',version:1},...bad},parent,'https://site.test','ready'),false);
 assert.equal(D.validEvent({source:parent,origin:'https://site.test',data:{type:'ready',version:1}},parent,'https://site.test','ready'),true);
});
test('one prefill after acknowledgement; forged confirmation cannot create receipt',()=>{
 const listeners={},sent=[],states=[],child={postMessage:(...args)=>sent.push(args)};
 const window={addEventListener:(k,fn)=>listeners[k]=fn,removeEventListener:k=>delete listeners[k]},frame={contentWindow:child,addEventListener:(k,fn)=>listeners['frame:'+k]=fn,removeEventListener:k=>delete listeners['frame:'+k]};
 vm.runInNewContext(source,{window,location:{origin:'https://site.test'},Date,Number});
 const cleanup=window.SalonAssistantOrder.attach(frame,{topic:'Private brief',consent:true},x=>states.push(x));
 const send=(state,extra={},origin='https://site.test',source=child)=>listeners.message({source,origin,data:{type:'salon:assistant-order-state',version:1,state,...extra}});
 send('ready');assert.equal(sent.length,1);assert.equal(sent[0][1],'https://site.test');assert.equal(sent[0][0].brief.consent,undefined);
 send('prefilled');send('ready');listeners['frame:load']();assert.equal(sent.length,1);
 for(const id of [true,0,-1,'12',null,1.2])send('confirmed',{id});
 assert.equal(states.some(x=>x.state==='confirmed'),false);
 send('confirmed',{id:12},'https://other.test');send('confirmed',{id:12},'https://site.test',{});assert.equal(states.some(x=>x.state==='confirmed'),false);
 send('confirmed',{id:12,pending:2});assert.equal(states.at(-1).id,12);assert.equal(states.at(-1).pending,2);cleanup();assert.deepEqual(listeners,{});
});
