import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
import { readInvoiceFile } from './reader-v2.js?v=50';

window.pdfjsLib=pdfjsLib;

const SUPABASE_URL='https://vbhvitwbcbymfafnfmdw.supabase.co';
const SUPABASE_KEY='sb_publishable_TOeRbvLnMA50JjqpO4tUNQ_s7rAvLmM';
const db=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
let currentMonth=new Date().toISOString().slice(0,7);
let editingId=null,invoiceFile=null,receiptFile=null,existingInvoicePath=null,existingReceiptPath=null,ocrResult=null;

const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
const dateAR=s=>s?new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(s+'T12:00:00')):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const nextMonth=m=>{const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,7);};
const parseMoney=v=>Number(String(v??'').replace(/\$/g,'').replace(/\./g,'').replace(',','.').replace(/\s/g,''))||0;
const fieldValue=(k)=>ocrResult?.fields?.[k]?.value??'';
const setVal=(id,v)=>{if($(id)&&v!==undefined&&v!==null)$(id).value=v;};

function setMonth(){
 const d=new Date(currentMonth+'-15T12:00:00');
 $('monthTitle').textContent=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(d).replace(/^./,c=>c.toUpperCase());
 $('monthPicker').value=currentMonth;loadBills();
}
function resetForm(){
 editingId=null;invoiceFile=null;receiptFile=null;existingInvoicePath=null;existingReceiptPath=null;ocrResult=null;
 $('modalTitle').textContent='Nueva factura';
 ['company','invoiceNumber','amount','issueDate','dueDate','accountNumber','periodStart','periodEnd','holderName','paymentDate','paymentAmount'].forEach(id=>setVal(id,''));
 $('service').value='Luz';$('status').value='Pendiente';$('paymentMethod').value='';$('fileInput').value='';$('receiptInput').value='';
 $('fileInfo').textContent='';$('ocrPanel').classList.add('hidden');$('ocrStatus').classList.add('hidden');$('invoicePreview').classList.add('hidden');$('invoicePreview').innerHTML='';
}
function openModal(){resetForm();$('modal').classList.remove('hidden');}
function closeModal(){$('modal').classList.add('hidden');}

async function uploadFile(file,folder){
 if(!file)return null;
 const ext=(file.name.split('.').pop()||'bin').toLowerCase();
 const path=folder+'/'+crypto.randomUUID()+'.'+ext;
 const {error}=await db.storage.from('household-bills').upload(path,file,{upsert:false});
 if(error)throw error;return path;
}
function fmtDateInput(v){return v||'';}
function confidenceClass(n){return n>=.9?'high':n>=.7?'medium':'low';}
function renderOCR(result){
 const f=result.fields||{};
 const rows=[
  ['Empresa',f.company],['Servicio',f.service],['Titular',f.holder],['Cliente/cuenta',f.account],
  ['Importe',f.amount],['Vencimiento',f.due],['Emisión',f.issue]
 ];
 const warnings=result.validation?.warnings||[];
 $('ocrPanel').innerHTML='<div class="analysisTitle"><div><b>Datos detectados</b><small>Revisá los campos antes de guardar.</small></div><span class="analysisBadge">'+(result.source==='pdf-text'?'PDF con texto':'OCR')+'</span></div>'+
 '<div class="analysisSummary">'+rows.map(([label,c])=>c?.value?'<div class="analysisRow"><span>'+label+'</span><b>'+esc(label==='Importe'?money(c.value):label.includes('Vencimiento')||label==='Emisión'?dateAR(c.value):c.value)+'</b><small><span class="confidence '+confidenceClass(c.confidence)+'">'+Math.round(c.confidence*100)+'% confianza</span> · '+esc(c.evidence||'')+'</small></div>':'').join('')+'</div>'+
 (warnings.length?'<div style="margin-top:10px;color:#92400e;font-size:12px;font-weight:700">⚠ '+warnings.map(esc).join(' · ')+'</div>':'<div style="margin-top:10px;color:#166534;font-size:12px;font-weight:700">✓ Datos principales detectados. Confirmalos antes de guardar.</div>');
 $('ocrPanel').classList.remove('hidden');
}
function applyOCR(result){
 const f=result.fields||{};
 setVal('company',fieldValue('company'));setVal('service',fieldValue('service')||'Otro');setVal('holderName',fieldValue('holder'));setVal('accountNumber',fieldValue('account'));
 setVal('amount',f.amount?.value?money(f.amount.value):'');setVal('dueDate',fmtDateInput(fieldValue('due')));setVal('issueDate',fmtDateInput(fieldValue('issue')));
 if(result.fields.invoice?.value)setVal('invoiceNumber',result.fields.invoice.value);
}
async function analyzeInvoice(file){
 $('ocrStatus').textContent='Analizando factura…';$('ocrStatus').classList.remove('hidden');
 $('saveBtn').disabled=true;
 try{
  ocrResult=await readInvoiceFile(file,msg=>{$('ocrStatus').textContent=msg;});
  applyOCR(ocrResult);renderOCR(ocrResult);
  $('ocrStatus').textContent='Análisis terminado. Revisá los datos detectados.';
 }catch(e){
  console.error(e);$('ocrStatus').textContent='No se pudo analizar automáticamente. Podés completar los datos manualmente.';
  $('ocrPanel').classList.remove('hidden');$('ocrPanel').innerHTML='<b>Lectura automática no disponible</b><div style="margin-top:6px;font-size:12px;color:#64748b">'+esc(e.message)+'</div>';
 }finally{$('saveBtn').disabled=false;}
}
async function saveBill(){
 const company=$('company').value.trim(),amount=parseMoney($('amount').value);
 if(!company||!amount){alert('Completá empresa e importe.');return;}
 $('saveBtn').disabled=true;
 try{
  let invoicePath=existingInvoicePath;if(invoiceFile)invoicePath=await uploadFile(invoiceFile,'invoices');
  let receiptPath=existingReceiptPath;if(receiptFile)receiptPath=await uploadFile(receiptFile,'receipts');
  const status=$('status').value;
  const payload={
   bill_month:currentMonth+'-01',service:$('service').value,company,invoice_number:$('invoiceNumber').value.trim(),amount,
   due_date:$('dueDate').value||null,issue_date:$('issueDate').value||null,account_number:$('accountNumber').value.trim(),
   holder_name:$('holderName').value.trim(),period_start:$('periodStart').value||null,period_end:$('periodEnd').value||null,status,
   invoice_file_path:invoicePath,receipt_file_path:receiptPath,payment_date:$('paymentDate').value||null,
   payment_amount:parseMoney($('paymentAmount').value)||null,payment_method:$('paymentMethod').value||null,
   ocr_source:ocrResult?.source||null,ocr_confidence:ocrResult?Math.min(...Object.values(ocrResult.fields||{}).filter(x=>x?.confidence).map(x=>x.confidence)):null,
   ocr_warnings:ocrResult?.validation?.warnings||null,ocr_text:ocrResult?.text||null,updated_at:new Date().toISOString()
  };
  const result=editingId?await db.from('household_bills').update(payload).eq('id',editingId):await db.from('household_bills').insert(payload);
  if(result.error)throw result.error;closeModal();await loadBills();
 }catch(e){console.error(e);alert('No se pudo guardar: '+e.message);}finally{$('saveBtn').disabled=false;}
}
async function loadBills(){
 const {data,error}=await db.from('household_bills').select('*').gte('bill_month',currentMonth+'-01').lt('bill_month',nextMonth(currentMonth)+'-01').order('due_date',{ascending:true,nullsFirst:false});
 if(error){$('billList').innerHTML='<div class="empty">No se pudieron cargar las facturas.</div>';return;}
 let total=0,paid=0,pending=0,upcoming=0;const today=new Date().toISOString().slice(0,10);
 for(const b of data||[]){const n=Number(b.amount)||0;total+=n;if(b.status==='Pagada')paid+=n;else{pending+=n;if(b.due_date&&b.due_date>=today)upcoming++;}}
 $('totalAmount').textContent=money(total);$('paidAmount').textContent=money(paid);$('pendingAmount').textContent=money(pending);$('upcomingCount').textContent=String(upcoming);
 if(!data?.length){$('billList').innerHTML='<div class="empty">Todavía no hay facturas cargadas este mes.</div>';return;}
 $('billList').innerHTML=data.map(b=>'<article class="bill"><div><b>'+esc(b.company)+'</b><small>'+esc(b.service||'Otro')+(b.account_number?' · '+esc(b.account_number):'')+'</small></div><div><small>Importe</small><b>'+money(b.amount)+'</b></div><div><small>Vence</small><b>'+dateAR(b.due_date)+'</b></div><div><span class="status '+(b.status==='Pagada'?'paid':'')+'">'+esc(b.status)+'</span></div><div class="billActions"><button data-action="edit" data-id="'+b.id+'">Editar</button><button data-action="toggle" data-id="'+b.id+'" data-status="'+b.status+'">'+(b.status==='Pagada'?'Pendiente':'Pagar')+'</button>'+(b.invoice_file_path?'<button data-action="file" data-path="'+encodeURIComponent(b.invoice_file_path)+'">Factura</button>':'')+(b.receipt_file_path?'<button data-action="file" data-path="'+encodeURIComponent(b.receipt_file_path)+'">Comprobante</button>':'')+'</div></article>').join('');
}
async function editBill(id){
 const {data,error}=await db.from('household_bills').select('*').eq('id',id).single();if(error||!data){alert('No se pudo abrir la factura.');return;}
 editingId=id;invoiceFile=null;receiptFile=null;ocrResult=null;existingInvoicePath=data.invoice_file_path||null;existingReceiptPath=data.receipt_file_path||null;
 $('modalTitle').textContent='Editar factura';setVal('service',data.service||'Otro');setVal('company',data.company);setVal('invoiceNumber',data.invoice_number);setVal('amount',data.amount?money(data.amount):'');
 ['dueDate','issueDate','periodStart','periodEnd','paymentDate'].forEach(id=>setVal(id,data[{dueDate:'due_date',issueDate:'issue_date',periodStart:'period_start',periodEnd:'period_end',paymentDate:'payment_date'}[id]]||''));
 setVal('accountNumber',data.account_number);setVal('holderName',data.holder_name);setVal('status',data.status||'Pendiente');setVal('paymentAmount',data.payment_amount?money(data.payment_amount):'');setVal('paymentMethod',data.payment_method||'');
 $('fileInput').value='';$('receiptInput').value='';$('fileInfo').innerHTML=(existingInvoicePath?'<button type="button" class="linkBtn" id="openExistingInvoice">Ver factura guardada</button>':'')+(existingReceiptPath?'<button type="button" class="linkBtn" id="openExistingReceipt">Ver comprobante guardado</button>':'');
 $('openExistingInvoice')?.addEventListener('click',()=>viewFile(existingInvoicePath));$('openExistingReceipt')?.addEventListener('click',()=>viewFile(existingReceiptPath));$('modal').classList.remove('hidden');
}
async function togglePaid(id,status){
 const newStatus=status==='Pagada'?'Pendiente':'Pagada';
 const update={status:newStatus,updated_at:new Date().toISOString()};
 if(newStatus==='Pagada'&&!$('paymentDate')){} 
 const {error}=await db.from('household_bills').update(update).eq('id',id);if(error)alert(error.message);else loadBills();
}
function viewFile(path){const {data}=db.storage.from('household-bills').getPublicUrl(path);$('viewer').src=data.publicUrl;$('viewModal').classList.remove('hidden');}

$('billList').addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;if(b.dataset.action==='edit')editBill(b.dataset.id);if(b.dataset.action==='toggle')togglePaid(b.dataset.id,b.dataset.status);if(b.dataset.action==='file')viewFile(decodeURIComponent(b.dataset.path));});
$('uploadBtn').onclick=openModal;$('uploadTop').onclick=openModal;$('closeModal').onclick=closeModal;$('cancelBtn').onclick=closeModal;
$('closeView').onclick=()=>{$('viewModal').classList.add('hidden');$('viewer').src='about:blank';};
$('fileInput').onchange=async e=>{invoiceFile=e.target.files[0]||null;if(!invoiceFile)return;$('fileInfo').textContent='Factura seleccionada: '+invoiceFile.name;$('invoicePreview').innerHTML='';if(invoiceFile.type.startsWith('image/')){const img=document.createElement('img');img.src=URL.createObjectURL(invoiceFile);$('invoicePreview').appendChild(img);}else{$('invoicePreview').innerHTML='<div style="padding:25px;color:#64748b">PDF seleccionado. La vista previa no es necesaria para iniciar el análisis.</div>';}$('invoicePreview').classList.remove('hidden');await analyzeInvoice(invoiceFile);};
$('receiptInput').onchange=e=>{receiptFile=e.target.files[0]||null;if(receiptFile)$('fileInfo').textContent+=' · Comprobante: '+receiptFile.name;};
$('amount').addEventListener('focus',e=>{if(e.target.value)e.target.value=parseMoney(e.target.value).toString();});$('amount').addEventListener('blur',e=>{const n=parseMoney(e.target.value);e.target.value=n?money(n):'';});
$('paymentAmount').addEventListener('focus',e=>{if(e.target.value)e.target.value=parseMoney(e.target.value).toString();});$('paymentAmount').addEventListener('blur',e=>{const n=parseMoney(e.target.value);e.target.value=n?money(n):'';});
$('saveBtn').onclick=saveBill;$('monthPicker').onchange=e=>{currentMonth=e.target.value;setMonth();};$('prevMonth').onclick=()=>{const d=new Date(currentMonth+'-01T12:00:00');d.setMonth(d.getMonth()-1);currentMonth=d.toISOString().slice(0,7);setMonth();};$('nextMonth').onclick=()=>{currentMonth=nextMonth(currentMonth);setMonth();};setMonth();
