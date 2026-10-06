import { readInvoiceFile } from './reader-v2.js?v=26';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://vbhvitwbcbymfafnfmdw.supabase.co';
const SUPABASE_KEY='sb_publishable_TOeRbvLnMA50JjqpO4tUNQ_s7rAvLmM';
const db=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);

let currentMonth=new Date().toISOString().slice(0,7);
let editingId=null, invoiceFile=null, receiptFile=null, editingReceiptPath=null;

const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n)||0);
const dateAR=s=>s?new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(s+'T12:00:00')):'—';

function nextMonth(m){
  const d=new Date(m+'-01T12:00:00'); d.setMonth(d.getMonth()+1);
  return d.toISOString().slice(0,7);
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function parseMoney(v){
  return Number(String(v).replace(/\$/g,'').replace(/\./g,'').replace(',','.').replace(/\s/g,''))||0;
}

function setMonth(){
  const d=new Date(currentMonth+'-15T12:00:00');
  $('monthTitle').textContent=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(d).replace(/^./,c=>c.toUpperCase());
  $('monthPicker').value=currentMonth;
  loadBills();
}

function resetForm(){
  editingId=null; invoiceFile=null; receiptFile=null; editingReceiptPath=null;
  $('modalTitle').textContent='Nueva factura';
  $('service').value='Luz';
  ['company','amount','dueDate','issueDate','accountNumber','holderName'].forEach(id=>$(id).value='');
  $('status').value='Pendiente';
  $('fileInfo').textContent='';
  $('reading').classList.add('hidden');
  $('dropzone').classList.remove('hidden');
  $('analysisPanel')?.classList.add('hidden');
  $('analysisSummary')?.replaceChildren();
  $('receiptInput').value='';
}

function openModal(){resetForm();$('modal').classList.remove('hidden');}
function closeModal(){$('modal').classList.add('hidden');}

function confidenceLabel(n){
  if(n>=.9)return '<span class="confidence high">Alta</span>';
  if(n>=.7)return '<span class="confidence medium">Media</span>';
  return '<span class="confidence low">Revisar</span>';
}

function renderAnalysis(result){
  const panel=$('analysisPanel'), summary=$('analysisSummary');
  if(!panel||!summary)return;
  summary.innerHTML='';
  const fields=[
    ['Empresa','company'],['Servicio','service'],['Titular','holder'],
    ['Cliente / cuenta','account'],['Importe','amount'],['Emisión','issue'],['Vencimiento','due']
  ];
  for(const [label,key] of fields){
    const f=result.fields?.[key];
    const value=f?.value;
    const row=document.createElement('div');
    row.className='analysisRow';
    row.innerHTML='<span>'+esc(label)+'</span><b>'+esc(key==='amount'&&value?money(value):key==='issue'||key==='due'?dateAR(value):value||'No detectado')+'</b><small>'+(f?confidenceLabel(f.confidence):'<span class="confidence low">Falta</span>')+'</small>';
    summary.appendChild(row);
  }
  panel.classList.remove('hidden');
}

async function readViaZerodoc(file){
  const form=new FormData();
  form.append('file',file,file.name);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  let r;
  try{
    r=await fetch(SUPABASE_URL+'/functions/v1/zerodoc-extract',{
      method:'POST',
      headers:{apikey:SUPABASE_KEY},
      body:form,
      signal:controller.signal
    });
  }catch(e){
    if(e.name==='AbortError') throw new Error('El lector inteligente tardó demasiado en responder.');
    throw e;
  }finally{
    clearTimeout(timeout);
  }
  if(!r.ok) throw new Error('Zerodoc: '+(await r.text()));
  const z=await r.json();
  if(z.status && z.status!=='ok') throw new Error('Zerodoc no pudo procesar la factura.');
  const f=z.fields||{};
  const refs=Array.isArray(f.reference_numbers?.value)?f.reference_numbers.value:[];
  const account=f.account_number?.value||refs[0]||'';
  const company=f.supplier?.value||'';
  const service=/edesur|distribuidora de energia sur/i.test(company)?'Luz':
    /metrogas/i.test(company)?'Gas':
    /aysa|agua y saneamientos/i.test(company)?'Agua':'';
  return {file,text:z.text||'',source:'zerodoc',pages:z.document?.page_count||1,
    fields:{
      company:company?{value:company,confidence:f.supplier?.confidence||0}:null,
      service:service?{value:service,confidence:.95}:null,
      holder:f.customer_name?.value?{value:f.customer_name.value,confidence:f.customer_name.confidence||0}:null,
      account:account?{value:String(account),confidence:f.account_number?.confidence||f.reference_numbers?.confidence||0}:null,
      amount:f.total_amount?.value!=null?{value:Number(f.total_amount.value),confidence:f.total_amount.confidence||0}:null,
      issue:f.invoice_date?.value?{value:f.invoice_date.value,confidence:f.invoice_date.confidence||0}:null,
      due:f.due_date?.value?{value:f.due_date.value,confidence:f.due_date.confidence||0}:null
    },
    validation:{ok:!!(f.supplier?.value&&f.total_amount?.value&&f.due_date?.value),
      warnings:z.extraction_warnings||[]}
  };
}

async function readFile(file){
  $('reading').classList.remove('hidden');
  $('dropzone').classList.add('hidden');
  $('reading').textContent='⏳ Analizando factura argentina...';
  try{
    // Usamos primero el mismo lector argentino que comprobamos con Edesur.
    // Zerodoc queda como respaldo si el lector local no puede procesar el documento.
    let result;
    try{
      $('reading').textContent='⏳ Leyendo factura con lector argentino...';
      result=await readInvoiceFile(file,msg=>{$('reading').textContent='⏳ '+msg+'...'});
    }catch(localError){
      console.warn('Lector argentino no disponible; usando lector inteligente:',localError);
      $('reading').textContent='⏳ Analizando con lector inteligente...';
      result=await readViaZerodoc(file);
    }

    const f=result.fields||{};
    if(f.company?.value)$('company').value=f.company.value;
    if(f.service?.value)$('service').value=f.service.value;
    if(f.amount?.value)$('amount').value=money(f.amount.value);
    if(f.due?.value)$('dueDate').value=f.due.value;
    if(f.issue?.value)$('issueDate').value=f.issue.value;
    if(f.account?.value)$('accountNumber').value=f.account.value;
    if(f.holder?.value)$('holderName').value=f.holder.value;

    invoiceFile=file;
    renderAnalysis(result);
    $('fileInfo').textContent='Documento seleccionado: '+file.name+' · '+(result.source||'lector argentino');

    const complete=!!(f.company?.value&&f.amount?.value&&f.due?.value&&f.issue?.value&&f.account?.value&&f.holder?.value);
    $('reading').textContent=complete
      ? '✓ Factura argentina leída. Revisá los datos antes de guardar.'
      : '⚠ Lectura parcial. Revisá los campos indicados antes de guardar.';
  }catch(e){
    console.error(e);
    invoiceFile=file;
    $('reading').textContent='⚠ No se pudo analizar automáticamente. Podés completar los datos manualmente.';
    $('fileInfo').textContent='Documento seleccionado: '+file.name;
  }
}

async function uploadFile(file,folder){
  if(!file)return null;
  const ext=file.name.split('.').pop().toLowerCase();
  const path=folder+'/'+crypto.randomUUID()+'.'+ext;
  const {error}=await db.storage.from('household-bills').upload(path,file,{upsert:false});
  if(error)throw error;
  return {path};
}

async function saveBill(){
  const amount=parseMoney($('amount').value);
  if(!$('company').value.trim()||!amount){
    alert('Completá empresa e importe.');
    return;
  }
  $('saveBtn').disabled=true;
  try{
    let invoicePath=editingId?undefined:null;
    if(invoiceFile)invoicePath=(await uploadFile(invoiceFile,'invoices')).path;
    const payload={
      bill_month:currentMonth+'-01',
      service:$('service').value,
      company:$('company').value.trim(),
      amount,
      due_date:$('dueDate').value||null,
      issue_date:$('issueDate').value||null,
      account_number:$('accountNumber').value.trim(),
      holder_name:$('holderName').value.trim(),
      status:$('status').value,
      updated_at:new Date().toISOString()
    };
    if(invoicePath)payload.invoice_file_path=invoicePath;
    let receiptPath=editingReceiptPath;
    if(receiptFile)receiptPath=(await uploadFile(receiptFile,'receipts')).path;
    if(receiptPath)payload.receipt_file_path=receiptPath;

    const q=editingId
      ? db.from('household_bills').update(payload).eq('id',editingId)
      : db.from('household_bills').insert(payload);
    const {error}=await q;
    if(error)throw error;
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
    .order('due_date',{ascending:true});
  if(error){
    $('billList').innerHTML='<div class="empty">No se pudieron cargar las facturas.</div>';
    return;
  }

  let total=0,paid=0,pending=0,upcoming=0;
  const today=new Date().toISOString().slice(0,10);
  data.forEach(b=>{
    total+=+b.amount||0;
    if(b.status==='Pagada')paid+=+b.amount||0;
    else{
      pending+=+b.amount||0;
      if(b.due_date&&b.due_date>=today)upcoming++;
    }
  });
  $('totalAmount').textContent=money(total);
  $('paidAmount').textContent=money(paid);
  $('pendingAmount').textContent=money(pending);
  $('upcomingCount').textContent=upcoming;

  if(!data.length){
    $('billList').innerHTML='<div class="empty">Todavía no hay facturas cargadas este mes.</div>';
    return;
  }

  $('billList').innerHTML=data.map(b=>`
    <article class="bill">
      <div><b>${esc(b.company)}</b><small>${esc(b.service)}${b.account_number?' · '+esc(b.account_number):''}</small></div>
      <div><small>Importe</small><b>${money(b.amount)}</b></div>
      <div><small>Vence</small><b>${dateAR(b.due_date)}</b></div>
      <div><span class="status ${b.status==='Pagada'?'paid':''}">${esc(b.status)}</span></div>
      <div class="billActions">
        <button data-action="edit" data-id="${b.id}">Editar</button>
        <button data-action="toggle" data-id="${b.id}" data-status="${b.status}">${b.status==='Pagada'?'Pendiente':'Pagar'}</button>
        ${b.invoice_file_path?'<button data-action="file" data-path="'+encodeURIComponent(b.invoice_file_path)+'">PDF</button>':''}
        ${b.receipt_file_path?'<button data-action="file" data-path="'+encodeURIComponent(b.receipt_file_path)+'">Comprobante</button>':''}
      </div>
    </article>`).join('');
}

window.editBill=async id=>{
  const {data}=await db.from('household_bills').select('*').eq('id',id).single();
  if(!data)return;
  editingId=id;
  invoiceFile=null; receiptFile=null; editingReceiptPath=data.receipt_file_path||null;
  $('modalTitle').textContent='Revisar / editar factura';
  $('service').value=data.service;
  $('company').value=data.company;
  $('amount').value=money(data.amount);
  $('dueDate').value=data.due_date||'';
  $('issueDate').value=data.issue_date||'';
  $('accountNumber').value=data.account_number||'';
  $('holderName').value=data.holder_name||'';
  $('status').value=data.status;
  $('fileInfo').textContent=(data.invoice_file_path?'Factura guardada. ':'')+(data.receipt_file_path?'Comprobante guardado.':'');
  $('receiptInput').value='';
  $('reading').classList.add('hidden');
  $('dropzone').classList.remove('hidden');
  $('analysisPanel')?.classList.add('hidden');
  $('modal').classList.remove('hidden');
};

window.togglePaid=async(id,status)=>{
  const {error}=await db.from('household_bills').update({status:status==='Pagada'?'Pendiente':'Pagada',updated_at:new Date().toISOString()}).eq('id',id);
  if(error)alert(error.message);else loadBills();
};

window.viewFile=path=>{ path=decodeURIComponent(path); path=decodeURIComponent(path);
  const {data}=db.storage.from('household-bills').getPublicUrl(path);
  $('viewer').src=data.publicUrl;
  $('viewModal').classList.remove('hidden');
};

$('billList').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action]');
  if(!btn)return;
  const action=btn.dataset.action;
  if(action==='edit')window.editBill(btn.dataset.id);
  if(action==='toggle')window.togglePaid(btn.dataset.id,btn.dataset.status);
  if(action==='file')window.viewFile(btn.dataset.path);
});
$('uploadBtn').onclick=openModal;
$('uploadTop').onclick=openModal;
$('closeModal').onclick=closeModal;
$('cancelBtn').onclick=closeModal;
$('closeView').onclick=()=>$('viewModal').classList.add('hidden');
$('fileInput').onchange=e=>{if(e.target.files[0])readFile(e.target.files[0]);};
$('receiptInput').onchange=e=>{receiptFile=e.target.files[0]||null;};
$('saveBtn').onclick=saveBill;
$('monthPicker').onchange=e=>{currentMonth=e.target.value;setMonth();};
$('prevMonth').onclick=()=>{const d=new Date(currentMonth+'-01T12:00:00');d.setMonth(d.getMonth()-1);currentMonth=d.toISOString().slice(0,7);setMonth();};
$('nextMonth').onclick=()=>{currentMonth=nextMonth(currentMonth);setMonth();};
setMonth();
