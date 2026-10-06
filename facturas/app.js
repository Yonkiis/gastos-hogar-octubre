import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const SUPABASE_URL='https://xnexfqbcxvrloirhrteo.supabase.co';
const SUPABASE_KEY='sb_publishable_S50gnzXMiYfh0O3IyqM6DQ_Kjqvdhlp';
const db=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
let currentMonth=new Date().toISOString().slice(0,7), editingId=null, invoiceFile=null, receiptFile=null, editingReceiptPath=null;
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
const dateAR=s=>s?new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(s+'T12:00:00')):'—';
function setMonth(){const d=new Date(currentMonth+'-15T12:00:00');$('monthTitle').textContent=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(d).replace(/^./,c=>c.toUpperCase());$('monthPicker').value=currentMonth;loadBills()}
function fmtInput(el){el.value=money(String(el.value).replace(/\D/g,''))}
function parseMoney(v){return Number(String(v).replace(/\$/g,'').replace(/\./g,'').replace(',','.').replace(/\s/g,''))||0}
function resetForm(){editingId=null;invoiceFile=null;receiptFile=null;editingReceiptPath=null;$('modalTitle').textContent='Nueva factura';$('service').value='Luz';['company','amount','dueDate','issueDate','accountNumber','holderName'].forEach(x=>$(x).value='');$('status').value='Pendiente';$('fileInfo').textContent='';$('reading').classList.add('hidden');$('dropzone').classList.remove('hidden')}
function openModal(){resetForm();$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden')}
function parseDate(s){const m=s.match(/(?:0?[1-9]|[12]\d|3[01])\s*[\/-]\s*(?:0?[1-9]|1[0-2])\s*[\/-]\s*(?:20\d{2})/);if(!m)return '';const p=m[0].replace(/\s/g,'').split(/[\/-]/);return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')}
function parseAmount(s){const m=s.match(/(?:\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/);return m?m[1]:''}
function analyzeText(text){const clean=text.replace(/\r/g,'');const upper=clean.toUpperCase();let company='',service='Otro';if(upper.includes('METROGAS')){company='MetroGAS';service='Gas'}else if(upper.includes('EDESUR')){company='Edesur';service='Luz'}else if(upper.includes('AYSA')){company='AySA';service='Agua'}else if(upper.includes('ARBA')){company='ARBA';service='ARBA departamento'}else if(upper.includes('MUNICIPAL')){company='Municipal';service='Municipal'}else if(upper.includes('PERSONAL')||upper.includes('MOVISTAR')||upper.includes('CLARO')||upper.includes('TELECENTRO')){service='Internet'}
let amount='',due='',issue='',account='',holder='';
if(company==='MetroGAS'){
let m=clean.match(/TOTAL A PAGAR\s*\$?\s*([0-9.]+,[0-9]{2})/i);if(m)amount=m[1];
m=clean.match(/FECHA DE VENCIMIENTO\s*:\s*([0-9\/.-]+)/i);if(m)due=parseDate(m[1]);
m=clean.match(/FECHA DE EMISI[ÓO]N\s*:\s*([0-9\/.-]+)/i);if(m)issue=parseDate(m[1]);
m=clean.match(/N[úu]mero\s+de\s+cliente\s*([0-9]{8,})/i);if(m)account=m[1];
/* MetroGAS: el PDF de esta factura concatena los bloques sin saltos de línea.
   La estructura real es: MetroGAS S.A. -> número de referencia (12 dígitos)
   -> titular -> domicilio. Por eso no buscamos "la primera palabra en mayúsculas",
   que podía devolver "Código". */
const lines=clean.split(/\\n+/).map(x=>x.trim()).filter(Boolean);
const metroIndex=lines.findIndex(x=>/METROGAS\\s+S\\.A\\./i.test(x));
if(metroIndex>=0){
  const section=lines.slice(metroIndex,Math.min(lines.length,metroIndex+12));
  const refIndex=section.findIndex(x=>/\\b\\d{8,}\\b/.test(x));
  if(refIndex>=0){
    const after=section.slice(refIndex).join(' ');
    const hm=after.match(/\\b\\d{8,}\\b\\s+([A-ZÁÉÍÓÚÑ]+(?:\\s+[A-ZÁÉÍÓÚÑ]+){1,5})(?=\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\\s+\\d{1,5}\\b)/i);
    if(hm)holder=hm[1].trim();
    if(!holder){
      const hm2=after.match(/\\b\\d{8,}\\b\\s+([A-ZÁÉÍÓÚÑ]+(?:\\s+[A-ZÁÉÍÓÚÑ]+){1,5})\\b/i);
      if(hm2&&!/^(CODIGO|CÓDIGO|CLIENTE|CUENTA|NUMERO|NÚMERO)$/i.test(hm2[1]))holder=hm2[1].trim();
    }
  }
}
}else{
const lines=clean.split('\n').map(x=>x.trim()).filter(Boolean);
let i=lines.findIndex(x=>/TOTAL A PAGAR/i.test(x));if(i>=0)amount=parseAmount(lines[i]);
const vd=lines.find(x=>/VENCIMIENTO/i.test(x));if(vd)due=parseDate(vd);
const em=lines.find(x=>/EMISI[ÓO]N/i.test(x));if(em)issue=parseDate(em);
const ac=lines.find(x=>/N[ÚU]MERO.*CLIENTE|N[ÚU]MERO.*CUENTA/i.test(x));if(ac){const mm=ac.match(/[0-9]{6,}/);if(mm)account=mm[0]}
}
return {company,service,amount,due,issue,account,holder}
}
async function extractPdf(file){const buf=await file.arrayBuffer();if(!window.pdfjsLib)throw new Error('No se pudo cargar el lector PDF');const pdf=await window.pdfjsLib.getDocument({data:buf,disableWorker:true}).promise;let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const c=await page.getTextContent();const items=c.items.map(x=>({str:(x.str||'').trim(),x:x.transform?.[4]||0,y:x.transform?.[5]||0})).filter(x=>x.str);items.sort((a,b)=>b.y-a.y||a.x-b.x);const rows=[];for(const item of items){let row=rows.find(r=>Math.abs(r.y-item.y)<3);if(!row){row={y:item.y,items:[]};rows.push(row)}row.items.push(item)}rows.sort((a,b)=>b.y-a.y);text+=rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ')).join('\\n')+'\\n'}if(text.replace(/\s/g,'').length>80)return text;$('reading').textContent='⏳ El PDF es una imagen. Aplicando OCR...';let ocr='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const viewport=page.getViewport({scale:2});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d');await page.render({canvasContext:ctx,viewport}).promise;const r=await Tesseract.recognize(canvas,'spa',{logger:m=>{if(m.status==='recognizing text')$('reading').textContent='⏳ OCR página '+i+' de '+pdf.numPages+'...'}});ocr+=r.data.text+'\n'}return ocr}
async function extractImage(file){const r=await Tesseract.recognize(file,'spa');return r.data.text}
async function readFile(file){$('reading').classList.remove('hidden');$('dropzone').classList.add('hidden');$('reading').textContent='⏳ Analizando factura...';try{const text=file.type==='application/pdf'?await extractPdf(file):await extractImage(file);const data=analyzeText(text);if(data.company)$('company').value=data.company;if(data.service)$('service').value=data.service;if(data.amount)$('amount').value='$'+data.amount;if(data.due)$('dueDate').value=data.due;if(data.issue)$('issueDate').value=data.issue;if(data.account)$('accountNumber').value=data.account;if(data.holder)$('holderName').value=data.holder;invoiceFile=file;$('fileInfo').textContent='Factura seleccionada: '+file.name;$('reading').textContent='✓ Datos extraídos. Revisalos antes de guardar.'}catch(e){console.error(e);$('reading').textContent='No se pudo leer automáticamente. Error: '+(e?.message||e)+'';invoiceFile=file;$('fileInfo').textContent='Factura seleccionada: '+file.name}}
async function uploadFile(file,folder){if(!file)return null;const ext=file.name.split('.').pop().toLowerCase();const path=folder+'/'+crypto.randomUUID()+'.'+ext;const {error}=await db.storage.from('household-bills').upload(path,file,{upsert:false});if(error)throw error;const {data}=db.storage.from('household-bills').getPublicUrl(path);return {path,url:data.publicUrl}}
async function saveBill(){const amount=parseMoney($('amount').value);if(!$('company').value.trim()||!amount){alert('Completá empresa e importe.');return}$('saveBtn').disabled=true;try{let invoicePath=null;if(invoiceFile)invoicePath=(await uploadFile(invoiceFile,'invoices')).path;let payload={bill_month:currentMonth+'-01',service:$('service').value,company:$('company').value.trim(),amount,due_date:$('dueDate').value||null,issue_date:$('issueDate').value||null,account_number:$('accountNumber').value.trim(),holder_name:$('holderName').value.trim(),status:$('status').value};if(invoicePath)payload.invoice_file_path=invoicePath;let receiptPath=editingReceiptPath;if(receiptFile)receiptPath=(await uploadFile(receiptFile,'receipts')).path;if(receiptPath)payload.receipt_file_path=receiptPath;let q=editingId?db.from('household_bills').update(payload).eq('id',editingId):db.from('household_bills').insert(payload);const {error}=await q;if(error)throw error;closeModal();await loadBills()}catch(e){console.error(e);alert('No se pudo guardar: '+e.message)}finally{$('saveBtn').disabled=false}}
async function loadBills(){const {data,error}=await db.from('household_bills').select('*').gte('bill_month',currentMonth+'-01').lt('bill_month',nextMonth(currentMonth)+'-01').order('due_date',{ascending:true});if(error){$('billList').innerHTML='<div class="empty">No se pudieron cargar las facturas.</div>';return}let total=0,paid=0,pending=0,upcoming=0;data.forEach(b=>{total+=+b.amount;if(b.status==='Pagada')paid+=+b.amount;else{pending+=+b.amount;if(b.due_date&&b.due_date>=new Date().toISOString().slice(0,10))upcoming++}});$('totalAmount').textContent=money(total);$('paidAmount').textContent=money(paid);$('pendingAmount').textContent=money(pending);$('upcomingCount').textContent=upcoming;if(!data.length){$('billList').innerHTML='<div class="empty">Todavía no hay facturas cargadas este mes.</div>';return}$('billList').innerHTML=data.map(b=>'<article class="bill"><div><b>'+esc(b.company)+'</b><small>'+esc(b.service)+(b.account_number?' · '+esc(b.account_number):'')+'</small></div><div><small>Importe</small><b>'+money(b.amount)+'</b></div><div><small>Vence</small><b>'+dateAR(b.due_date)+'</b></div><div><span class="status '+(b.status==='Pagada'?'paid':'')+'">'+b.status+'</span></div><div class="billActions"><button onclick="window.editBill(\''+b.id+'\')">Editar</button><button onclick="window.togglePaid(\''+b.id+'\',\''+b.status+'\')">'+(b.status==='Pagada'?'Pendiente':'Pagar')+'</button>'+(b.invoice_file_path?'<button onclick="window.viewFile(\''+b.invoice_file_path+'\')">PDF</button>':'')+(b.receipt_file_path?'<button onclick="window.viewFile(\''+b.receipt_file_path+'\')">Comprobante</button>':'')+'</div></article>').join('')}
function nextMonth(m){const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,7)}
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
window.editBill=async id=>{const {data}=await db.from('household_bills').select('*').eq('id',id).single();if(!data)return;editingId=id;$('modalTitle').textContent='Editar factura';$('service').value=data.service;$('company').value=data.company;$('amount').value=money(data.amount);$('dueDate').value=data.due_date||'';$('issueDate').value=data.issue_date||'';$('accountNumber').value=data.account_number||'';$('holderName').value=data.holder_name||'';$('status').value=data.status;editingReceiptPath=data.receipt_file_path||null;$('fileInfo').textContent=(data.invoice_file_path?'Factura guardada. ':'')+(data.receipt_file_path?'Comprobante guardado.':'');$('receiptInput').value='';$('reading').classList.add('hidden');$('dropzone').classList.remove('hidden');$('modal').classList.remove('hidden')}
window.togglePaid=async(id,status)=>{const {error}=await db.from('household_bills').update({status:status==='Pagada'?'Pendiente':'Pagada',updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);else loadBills()}
window.viewFile=path=>{const {data}=db.storage.from('household-bills').getPublicUrl(path);$('viewer').src=data.publicUrl;$('viewModal').classList.remove('hidden')}
$('uploadBtn').onclick=openModal;$('uploadTop').onclick=openModal;$('closeModal').onclick=closeModal;$('cancelBtn').onclick=closeModal;$('closeView').onclick=()=>$('viewModal').classList.add('hidden');$('fileInput').onchange=e=>{if(e.target.files[0])readFile(e.target.files[0])};$('receiptInput').onchange=e=>{receiptFile=e.target.files[0]||null};$('saveBtn').onclick=saveBill;$('monthPicker').onchange=e=>{currentMonth=e.target.value;setMonth()};$('prevMonth').onclick=()=>{const d=new Date(currentMonth+'-01T12:00:00');d.setMonth(d.getMonth()-1);currentMonth=d.toISOString().slice(0,7);setMonth()};$('nextMonth').onclick=()=>{currentMonth=nextMonth(currentMonth);setMonth()};setMonth();