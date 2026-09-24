// File objects remain in this form's memory. Nothing is uploaded before order confirmation.
const filePicker=$('files'),dropZone=filePicker.closest('.upload-box'),previews=new Map();
let removedFile=null;
const fileNotice=document.createElement('p');fileNotice.className='comfort-file-notice';fileNotice.setAttribute('role','status');fileNotice.setAttribute('aria-live','polite');fileNotice.hidden=true;
const undoRow=document.createElement('div');undoRow.className='comfort-file-undo';undoRow.hidden=true;
const undoText=document.createElement('span'),undoButton=document.createElement('button');undoButton.type='button';undoButton.textContent='Вернуть';undoRow.append(undoText,undoButton);
$('file-list').removeAttribute('aria-live');$('file-list').after(undoRow,fileNotice);
const filesLocked=()=>busy||!!frozenPayload||!!confirmed;
function announceFiles(text){fileNotice.textContent=text;fileNotice.hidden=!text}
function releasePreview(item){const url=previews.get(item.id);if(url){URL.revokeObjectURL(url);previews.delete(item.id)}}
function fileSize(bytes){return bytes<1048576?Math.max(1,Math.round(bytes/1024))+' КБ':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(bytes/1048576)+' МБ'}
function fileCard(item,status,remove){
 const row=document.createElement('div');row.className='file-row comfort-file';row.dataset.fileId=item.id;
 const badge=document.createElement('span');badge.className='comfort-file-badge';badge.setAttribute('aria-hidden','true');
 const ext=item.file.name.split('.').pop().toUpperCase();badge.textContent=/^(DOC|DOCX)$/.test(ext)?'DOC':/^(JPG|JPEG|PNG|WEBP|HEIC)$/.test(ext)?'ФОТО':ext;
 if(/^(image\/jpeg|image\/png|image\/webp)$/.test(item.file.type)){
  const img=document.createElement('img');img.alt='';img.decoding='async';img.loading='lazy';
  let url=previews.get(item.id);if(!url){url=URL.createObjectURL(item.file);previews.set(item.id,url)}img.src=url;
  img.addEventListener('error',()=>{img.remove();if(previews.get(item.id)===url)releasePreview(item)},{once:true});badge.append(img);
 }
 const text=document.createElement('div');text.className='comfort-file-copy';
 const name=document.createElement('span');name.className='comfort-file-name';name.textContent=item.file.name;
 const meta=document.createElement('span');meta.className='comfort-file-meta';meta.textContent=fileSize(item.file.size)+' · '+status;text.append(name,meta);row.append(badge,text);
 if(remove){const button=document.createElement('button');button.type='button';button.className='comfort-file-remove';button.textContent='×';button.setAttribute('aria-label','Убрать файл '+item.file.name);button.disabled=filesLocked();button.onclick=()=>{
   if(filesLocked())return;const index=queue.indexOf(item);if(index<0)return;
   removedFile={item,index};queue.splice(index,1);releasePreview(item);fileList();announceFiles('Файл убран. Его можно вернуть.');undoButton.focus({preventScroll:true});
  };row.append(button)}
 return row;
}
function fileList(){
 $('file-list').replaceChildren();for(const item of queue)$('file-list').append(fileCard(item,'Готов к отправке',true));
 undoRow.hidden=!removedFile;undoButton.disabled=filesLocked();
 if(removedFile){undoText.textContent='Убран: '+removedFile.item.file.name;undoButton.setAttribute('aria-label','Вернуть файл '+removedFile.item.file.name)}
 filePicker.dispatchEvent(new CustomEvent('salon:files-changed',{detail:{file:queue[0]?.file||null}}));
 dropZone.classList.toggle('is-locked',filesLocked());dropZone.setAttribute('aria-disabled',String(filesLocked()));
}
undoButton.onclick=()=>{
 if(filesLocked()||!removedFile)return;
 if(queue.length>=5){announceFiles('Уже добавлено 5 файлов. Убери один, чтобы вернуть этот.');return}
 const {item,index}=removedFile;
 if(!queue.some(a=>a.id===item.id))queue.splice(Math.min(index,queue.length),0,item);
 removedFile=null;fileList();announceFiles('Файл возвращён.');
 [...$('file-list').children].find(r=>r.dataset.fileId===item.id)?.querySelector('button')?.focus({preventScroll:true});
};
function addFiles(files){
 if(filesLocked())return;
 const errors=[];let added=0,duplicates=0;
 for(const f of files){
  if(queue.some(a=>a.id===fileId(f))){duplicates++;continue}
  if(!f.size||f.size>20*1048576){errors.push('Пустой файл или размер больше 20 МБ: '+f.name);continue}
  if(!/\.(docx?|pdf|rtf|odt|txt|jpe?g|png|webp|heic)$/i.test(f.name)){errors.push('Неподдерживаемый формат: '+f.name);continue}
  if(queue.length>=5){errors.push('Можно прикрепить до 5 файлов.');break}
  const item={file:f,id:fileId(f),state:'wait'};queue.push(item);added++;
  if(removedFile?.item.id===item.id)removedFile=null;
 }
 fileList();announceFiles(errors.join('\n')||(added?'Добавлено файлов: '+added+'. Всего '+queue.length+' из 5.':duplicates?'Этот файл уже добавлен.':''));
}
filePicker.addEventListener('change',()=>{addFiles(filePicker.files);filePicker.value=''});
const hasDraggedFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
function finishDrag(){dropZone.classList.remove('is-dragging')}
// Prevent accidental browser navigation if a file misses the target.
document.addEventListener('dragover',e=>{if(hasDraggedFiles(e)){e.preventDefault();e.dataTransfer.dropEffect=dropZone.contains(e.target)&&!filesLocked()?'copy':'none'}});
document.addEventListener('drop',e=>{if(hasDraggedFiles(e)){e.preventDefault();finishDrag()}});
dropZone.addEventListener('dragenter',e=>{if(hasDraggedFiles(e)){e.preventDefault();if(!filesLocked())dropZone.classList.add('is-dragging')}});
dropZone.addEventListener('dragleave',e=>{if(!dropZone.contains(e.relatedTarget))finishDrag()});
window.addEventListener('dragend',finishDrag);
dropZone.addEventListener('drop',e=>{
 if(!hasDraggedFiles(e))return;e.preventDefault();finishDrag();if(filesLocked())return;
 const before=queue.length;addFiles(Array.from(e.dataTransfer.files));
 if(queue.length>before){filePicker.dispatchEvent(new CustomEvent('salon:field-commit',{bubbles:true,detail:{inputEvent:e}}));
 }
});
window.addEventListener('pagehide',e=>{if(!e.persisted){for(const item of queue)releasePreview(item);if(removedFile)releasePreview(removedFile.item)}});
