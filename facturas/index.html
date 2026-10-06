import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://vbhvitwbcbymfafnfmdw.supabase.co';
const SUPABASE_KEY='sb_publishable_TOeRbvLnMA50JjqpO4tUNQ_s7rAvLmM';
const db=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);

let currentMonth=new Date().toISOString().slice(0,7);
let editingId=null, invoiceFile=null, receiptFile=null, existingInvoicePath=null, existingReceiptPath=null;

const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
const dateAR=s=>s?new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(s+'T12:00:00')):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function nextMonth(m){const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,7);}
function parseMoney(v){return Number(String(v).replace(/\$/g,'').replace(/\./g,'').replace(',','.').replace(/\s/g,''))||0;}

function setMonth(){
  const d=new Date(currentMonth+'-15T12:00:00');
  $('monthTitle').textContent=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(d).replace(/^./,c=>c.toUpperCase());
  $('monthPicker').value=currentMonth;
  loadBills();
}

function resetForm(){
  editingId=null; invoiceFile=null; receiptFile=null; existingInvoicePath=null; existingReceiptPath=null;
  $('modalTitle').textContent='Nueva factura';
  $('service').value='Luz';
  ['company','amount','dueDate','issueDate','accountNumber','holderName'].forEach(id=>$(id).value='');
  $('status').value='Pendiente';
  $('fileInfo').textContent='';
  $('receiptInput').value='';
  $('fileInput').value='';
}

function openModal(){resetForm();$('modal').classList.remove('hidden');}
function closeModal(){$('modal').classList.add('hidden');}

async function uploadFile(file,folder){
  if(!file)return null;
  const ext=(file.name.split('.').pop()||'bin').toLowerCase();
  const path=folder+'/'+crypto.randomUUID()+'.'+ext;
  const {error}=await db.storage.from('household-bills').upload(path,file,{upsert:false});
  if(error)throw error;
  return path;
}

function showSavedFiles(){
  const parts=[];
  if(existingInvoicePath)parts.push('<button type="button" class="linkBtn" id="openExistingInvoice">Ver factura guardada</button>');
  if(existingReceiptPath)parts.push('<button type="button" class="linkBtn" id="openExistingReceipt">Ver comprobante guardado</button>');
  $('fileInfo').innerHTML=parts.join(' ');
  $('openExistingInvoice')?.addEventListener('click',()=>viewFile(existingInvoicePath));
  $('openExistingReceipt')?.addEventListener('click',()=>viewFile(existingReceiptPath));
}

async function saveBill(){
  const company=$('company').value.trim();
  const amount=parseMoney($('amount').value);
  if(!company||!amount){alert('Completá empresa e importe.');return;}
  $('saveBtn').disabled=true;
  try{
    let invoicePath=existingInvoicePath;
    if(invoiceFile)invoicePath=await uploadFile(invoiceFile,'invoices');
    let receiptPath=existingReceiptPath;
    if(receiptFile)receiptPath=await uploadFile(receiptFile,'receipts');

    const payload={
      bill_month:currentMonth+'-01',
      service:$('service').value,
      company,
      amount,
      due_date:$('dueDate').value||null,
      issue_date:$('issueDate').value||null,
      account_number:$('accountNumber').value.trim(),
      holder_name:$('holderName').value.trim(),
      status:$('status').value,
      invoice_file_path:invoicePath,
      receipt_file_path:receiptPath,
      updated_at:new Date().toISOString()
    };

    const result=editingId
      ? await db.from('household_bills').update(payload).eq('id',editingId)
      : await db.from('household_bills').insert(payload);
    if(result.error)throw result.error;
    closeModal();
    await loadBills();
  }catch(e){
    console.error(e);
    alert('No se pudo guardar: '+e.message);
  }finally{$('saveBtn').disabled=false;}
}

async function loadBills(){
  const {data,error}=await db.from('household_bills')
    .select('*')
    .gte('bill_month',currentMonth+'-01')
    .lt('bill_month',nextMonth(currentMonth)+'-01')
    .order('due_date',{ascending:true,nullsFirst:false});
  if(error){$('billList').innerHTML='<div class="empty">No se pudieron cargar las facturas.</div>';return;}

  let total=0,paid=0,pending=0,upcoming=0;
  const today=new Date().toISOString().slice(0,10);
  for(const b of data||[]){
    const n=Number(b.amount)||0;
    total+=n;
    if(b.status==='Pagada')paid+=n;
    else{pending+=n;if(b.due_date&&b.due_date>=today)upcoming++;}
  }
  $('totalAmount').textContent=money(total);
  $('paidAmount').textContent=money(paid);
  $('pendingAmount').textContent=money(pending);
  $('upcomingCount').textContent=String(upcoming);

  if(!data?.length){
    $('billList').innerHTML='<div class="empty">Todavía no hay facturas cargadas este mes.</div>';
    return;
  }

  $('billList').innerHTML=data.map(b=>`
    <article class="bill">
      <div><b>${esc(b.company)}</b><small>${esc(b.service||'Otro')}${b.account_number?' · '+esc(b.account_number):''}</small></div>
      <div><small>Importe</small><b>${money(b.amount)}</b></div>
      <div><small>Vence</small><b>${dateAR(b.due_date)}</b></div>
      <div><span class="status ${b.status==='Pagada'?'paid':''}">${esc(b.status)}</span></div>
      <div class="billActions">
        <button data-action="edit" data-id="${b.id}">Editar</button>
        <button data-action="toggle" data-id="${b.id}" data-status="${b.status}">${b.status==='Pagada'?'Pendiente':'Pagar'}</button>
        ${b.invoice_file_path?'<button data-action="file" data-path="'+encodeURIComponent(b.invoice_file_path)+'">Factura</button>':''}
        ${b.receipt_file_path?'<button data-action="file" data-path="'+encodeURIComponent(b.receipt_file_path)+'">Comprobante</button>':''}
      </div>
    </article>`).join('');
}

async function editBill(id){
  const {data,error}=await db.from('household_bills').select('*').eq('id',id).single();
  if(error||!data){alert('No se pudo abrir la factura.');return;}
  editingId=id; invoiceFile=null; receiptFile=null;
  existingInvoicePath=data.invoice_file_path||null;
  existingReceiptPath=data.receipt_file_path||null;
  $('modalTitle').textContent='Editar factura';
  $('service').value=data.service||'Otro';
  $('company').value=data.company||'';
  $('amount').value=money(data.amount);
  $('dueDate').value=data.due_date||'';
  $('issueDate').value=data.issue_date||'';
  $('accountNumber').value=data.account_number||'';
  $('holderName').value=data.holder_name||'';
  $('status').value=data.status||'Pendiente';
  $('fileInput').value=''; $('receiptInput').value='';
  showSavedFiles();
  $('modal').classList.remove('hidden');
}

async function togglePaid(id,status){
  const newStatus=status==='Pagada'?'Pendiente':'Pagada';
  const {error}=await db.from('household_bills').update({status:newStatus,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)alert(error.message);else loadBills();
}

function viewFile(path){
  if(!path)return;
  const {data}=db.storage.from('household-bills').getPublicUrl(path);
  $('viewer').src=data.publicUrl;
  $('viewModal').classList.remove('hidden');
}

$('billList').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action]');
  if(!btn)return;
  if(btn.dataset.action==='edit')editBill(btn.dataset.id);
  if(btn.dataset.action==='toggle')togglePaid(btn.dataset.id,btn.dataset.status);
  if(btn.dataset.action==='file')viewFile(decodeURIComponent(btn.dataset.path));
});

$('uploadBtn').onclick=openModal;
$('uploadTop').onclick=openModal;
$('closeModal').onclick=closeModal;
$('cancelBtn').onclick=closeModal;
$('closeView').onclick=()=>{$('viewModal').classList.add('hidden');$('viewer').src='about:blank';};
$('fileInput').onchange=e=>{
  invoiceFile=e.target.files[0]||null;
  if(invoiceFile){
    $('fileInfo').innerHTML='<b>Factura seleccionada:</b> '+esc(invoiceFile.name);
    const preview=$('invoicePreview');
    if(preview){
      preview.innerHTML='';
      if(invoiceFile.type.startsWith('image/')){
        const img=document.createElement('img');
        img.src=URL.createObjectURL(invoiceFile);
        img.alt='Vista previa de la factura';
        preview.appendChild(img);
      }else if(invoiceFile.type==='application/pdf'){
        const iframe=document.createElement('iframe');
        iframe.src=URL.createObjectURL(invoiceFile);
        iframe.title='Vista previa de la factura';
        preview.appendChild(iframe);
      }
      preview.classList.remove('hidden');
    }
  }
};
$('receiptInput').onchange=e=>{
  receiptFile=e.target.files[0]||null;
  if(receiptFile)$('fileInfo').textContent+=( $('fileInfo').textContent?' · ':'')+'Comprobante seleccionado: '+receiptFile.name;
};
$('saveBtn').onclick=saveBill;
$('monthPicker').onchange=e=>{currentMonth=e.target.value;setMonth();};
$('prevMonth').onclick=()=>{const d=new Date(currentMonth+'-01T12:00:00');d.setMonth(d.getMonth()-1);currentMonth=d.toISOString().slice(0,7);setMonth();};
$('nextMonth').onclick=()=>{currentMonth=nextMonth(currentMonth);setMonth();};
setMonth();
