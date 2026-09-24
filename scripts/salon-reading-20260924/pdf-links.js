// Public share state is assigned only by a successfully completed paint.
let sharedPage=null,directHash=null;
const shareButton=$('pdf-share');
shareButton.onclick=()=>{if(!dialog.open||!sharedPage||shareButton.disabled)return;const value=sharedPage;window.SalonReading?.share('https://akademsalon.ru/samples.html#pdf='+encodeURIComponent(value.id)+'&page='+value.page,value.title+' · страница '+value.page,shareButton);};
function readDirect(){const m=/^#pdf=([a-z0-9-]+)&page=([1-9][0-9]{0,3})$/.exec(location.hash);if(!m)return null;const doc=docs.find(d=>d.id===m[1]),page=Number(m[2]);return doc&&page<=doc.pages?{doc,page}:null;}
function directOpen(){const entry=readDirect();if(!entry){if(directHash&&dialog.open){directHash=null;dialog.close();}return;}select(entry.doc);open(entry.doc,$('library-document').querySelector('.document-open'),true,entry.page);}
window.addEventListener('hashchange',directOpen);
directOpen();
