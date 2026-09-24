  function results(){
   const query=input.value.slice(0,160),engine=window.SalonReading;
   if(!engine)return;
   const unique=Array.from(new Map(routes.map(r=>[r.path,r])).values());
   const ranked=unique.map((r,i)=>({r,i,...engine.match(r.title+' '+r.kind,query)}));
   const found=ranked.filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.i-b.i);
   const list=found.slice(0,12);
   nav.innerHTML=list.map(({r})=>'<a href="'+esc(r.path)+'"><span>'+engine.highlight(r.title,query)+'</span><small>'+esc(r.kind)+' ↗</small></a>').join('');
   if(list.length){status.textContent=query.trim()?'Показано результатов: '+list.length+(found.some(x=>x.score>=2)?' · с учётом близких слов':''):'Начните вводить или выберите раздел.';return;}
   status.textContent='Точного совпадения нет.';
   const nearby=ranked.filter(x=>x.matched>0).sort((a,b)=>b.matched-a.matched||a.i-b.i).slice(0,3).map(x=>x.r);
   const suggestions=nearby.length?nearby:unique.filter(r=>['knowledge.html','samples.html','services.html'].includes(r.path));
   nav.innerHTML='<div class="sx-search-empty">'+engine.art('search')+'<p>Попробуй сократить запрос или выбрать раздел.</p></div><p class="sx-search-suggestions">'+(nearby.length?'По части запроса':'Можно начать здесь')+'</p>'+suggestions.map(r=>'<a href="'+esc(r.path)+'"><span>'+engine.highlight(r.title,query)+'</span><small>'+esc(r.kind)+' ↗</small></a>').join('');
  }
