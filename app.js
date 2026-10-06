const db=window.supabase.createClient(
 'https://xnexfqbcxvrloirhrteo.supabase.co',
 'sb_publishable_S50gnzXMiYfh0O3IyqM6DQ_Kjqvdhlp',
 {auth:{persistSession:true,autoRefreshToken:true,storageKey:'gastos-hogar-v3'}}
);

let expenses=[];
let incomes={toto:0,rocio:0};
let currentMonth=new Date().toISOString().slice(0,7);
let editingId=null;

const $=id=>document.getElementById(id);
const login=$('login'),app=$('app'),email=$('email'),password=$('password'),loginForm=$('loginForm'),loginMsg=$('loginMsg');
const incomeForm=$('incomeForm'),incomeMsg=$('incomeMsg'),incomeSummary=$('incomeSummary');
const totoIncome=$('totoIncome'),rocioIncome=$('rocioIncome');
const expenseForm=$('expenseForm'),expenseMsg=$('expenseMsg');
const date=$('date'),category=$('category'),amount=$('amount'),detail=$('detail'),paidBy=$('paidBy');
const list=$('list'),count=$('count'),totalEl=$('total'),balance=$('balance'),logout=$('logout');
const monthPicker=$('monthPicker'),monthTitle=$('monthTitle'),expenseTitle=$('expenseTitle'),historyTitle=$('historyTitle');
const editBox=$('editBox'),editDate=$('editDate'),editCategory=$('editCategory'),editAmount=$('editAmount'),editDetail=$('editDetail'),editPaidBy=$('editPaidBy'),cancelEdit=$('cancelEdit');

const money=n=>'$'+Math.round(Number(n)||0).toLocaleString('es-AR');
const percent=n=>Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const parse=v=>Number(String(v||'').replace(/[^0-9]/g,''))||0;
const monthName=m=>new Date(m+'-01T12:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
const monthRange=m=>({start:m+'-01',end:new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).toISOString().slice(0,10)});
function formatField(el){const d=el.value.replace(/[^0-9]/g,'');el.value=d?'$'+Number(d).toLocaleString('es-AR'):''}
function setMonth(m){currentMonth=m;monthPicker.value=m;monthTitle.textContent=monthName(m);expenseTitle.textContent='Agregar gasto de '+monthName(m);historyTitle.textContent='Gastos cargados en '+monthName(m);const r=monthRange(m);date.min=r.start;date.max=r.end;if(!date.value||date.value<r.start||date.value>r.end)date.value=r.start;loadMonth()}
function resetEdit(){editingId=null;editBox.classList.add('hide')}
async function loadIncome(){
 const r=await db.from('household_incomes').select('*').eq('month_key',currentMonth).maybeSingle();
 if(r.error){incomeMsg.textContent=r.error.message;return}
 incomes={toto:Number(r.data?.toto_income)||0,rocio:Number(r.data?.rocio_income)||0};
 totoIncome.value=incomes.toto?money(incomes.toto):'';rocioIncome.value=incomes.rocio?money(incomes.rocio):'';
 renderIncome()
}
async function loadExpenses(){
 const rr=monthRange(currentMonth);
 const r=await db.from('household_expenses').select('*').gte('expense_date',rr.start).lte('expense_date',rr.end).order('expense_date',{ascending:false}).order('created_at',{ascending:false});
 if(r.error){expenseMsg.textContent=r.error.message;return}
 expenses=r.data||[];render()
}
async function loadMonth(){resetEdit();await Promise.all([loadIncome(),loadExpenses()])}
function renderIncome(){
 const totalIncome=incomes.toto+incomes.rocio;
 if(!totalIncome){incomeSummary.innerHTML='<b>Cargá los dos sueldos para calcular automáticamente el porcentaje de cada uno.</b>';balance.innerHTML='<b>Faltan los sueldos del mes.</b>';return}
 const tp=incomes.toto/totalIncome*100,rp=incomes.rocio/totalIncome*100;
 incomeSummary.innerHTML='<div class="line"><span>Toto cobra</span><b>'+money(incomes.toto)+' · '+percent(tp)+'</b></div>'+
 '<div class="line"><span>Rocío cobra</span><b>'+money(incomes.rocio)+' · '+percent(rp)+'</b></div>'+
 '<div class="line"><span>Ingresos totales</span><b>'+money(totalIncome)+'</b></div>';
 renderBalance(expenses.reduce((s,x)=>s+(Number(x.amount)||0),0))
}
function render(){
 list.innerHTML='';let total=0;
 expenses.forEach(x=>{
  const av=Number(x.amount)||0;total+=av;
  const d=document.createElement('div');d.className='expense';
  const top=document.createElement('div');top.className='top';
  const c=document.createElement('b');c.textContent=x.category;
  const a=document.createElement('b');a.textContent=money(av);top.append(c,a);
  const det=document.createElement('div');det.className='detail';det.textContent='Detalle: '+(x.description||'Sin detalle');
  const meta=document.createElement('div');meta.className='meta';meta.textContent=x.expense_date+' · Pagó: '+x.paid_by;
  const ti=incomes.toto+incomes.rocio,parts=document.createElement('div');parts.className='meta';
  parts.textContent=ti?'Parte Toto: '+money(av*incomes.toto/ti)+' · Parte Rocío: '+money(av*incomes.rocio/ti):'Cargá los sueldos para calcular las partes.';
  const actions=document.createElement('div');
  const edit=document.createElement('button');edit.className='delete';edit.textContent='Editar';edit.onclick=()=>startEdit(x);
  const del=document.createElement('button');del.className='delete';del.textContent='Eliminar';del.style.marginLeft='8px';
  del.onclick=async()=>{if(!confirm('¿Eliminar este gasto?'))return;const r=await db.from('household_expenses').delete().eq('id',x.id);if(r.error){expenseMsg.textContent=r.error.message;return}await loadExpenses()};
  actions.append(edit,del);d.append(top,det,meta,parts,actions);list.append(d);
 });
 count.textContent='('+expenses.length+')';totalEl.textContent=money(total);renderBalance(total)
}
function renderBalance(total){
 const ti=incomes.toto+incomes.rocio;if(!ti){balance.innerHTML='<b>Faltan los sueldos del mes.</b>';return}
 const totoShare=total*incomes.toto/ti;let totoPaid=0,rocioPaid=0;
 expenses.forEach(x=>{const v=Number(x.amount)||0;if(x.paid_by==='Toto')totoPaid+=v;if(x.paid_by==='Rocío')rocioPaid+=v});
 const diff=totoPaid-totoShare;
 let html='<div class="line"><span>Total de gastos</span><b>'+money(total)+'</b></div>'+
 '<div class="line"><span>Toto debería pagar</span><b>'+money(totoShare)+'</b></div>'+
 '<div class="line"><span>Rocío debería pagar</span><b>'+money(total-totoShare)+'</b></div>'+
 '<div class="line"><span>Toto pagó realmente</span><b>'+money(totoPaid)+'</b></div>'+
 '<div class="line"><span>Rocío pagó realmente</span><b>'+money(rocioPaid)+'</b></div>';
 if(Math.abs(diff)<0.01)html+='<hr><b>Están a mano. No se deben dinero entre ustedes.</b>';
 else if(diff>0)html+='<hr><b>Rocío debe a Toto: '+money(diff)+'</b>';
 else html+='<hr><b>Toto debe a Rocío: '+money(-diff)+'</b>';
 balance.innerHTML=html
}
function startEdit(x){
 editingId=x.id;editDate.value=x.expense_date;editCategory.value=x.category;editAmount.value=money(x.amount);editDetail.value=x.description||'';editPaidBy.value=x.paid_by;editBox.classList.remove('hide');editBox.scrollIntoView({behavior:'smooth',block:'center'})
}
loginForm.onsubmit=async e=>{e.preventDefault();loginMsg.textContent='';const r=await db.auth.signInWithPassword({email:email.value.trim(),password:password.value});if(r.error){loginMsg.textContent=r.error.message;return}show()};
function show(){login.classList.add('hide');app.classList.remove('hide');setMonth(currentMonth)}
logout.onclick=async()=>{await db.auth.signOut();location.reload()};
expenseForm.onsubmit=async e=>{e.preventDefault();const row={expense_date:date.value,category:category.value,description:detail.value.trim(),amount:parse(amount.value),paid_by:paidBy.value};if(!row.amount){expenseMsg.textContent='Ingresá un importe válido.';return}const r=await db.from('household_expenses').insert(row).select('*').single();if(r.error){expenseMsg.textContent=r.error.message;return}amount.value='';detail.value='';expenseMsg.textContent='Gasto guardado correctamente.';await loadExpenses()};
incomeForm.onsubmit=async e=>{e.preventDefault();const toto=parse(totoIncome.value),rocio=parse(rocioIncome.value);const r=await db.from('household_incomes').upsert({month_key:currentMonth,toto_income:toto,rocio_income:rocio,updated_at:new Date().toISOString()},{onConflict:'month_key'});if(r.error){incomeMsg.textContent=r.error.message;return}incomes={toto,rocio};renderIncome();render();incomeMsg.textContent='Ingresos guardados correctamente.'};
$('monthForm').onsubmit=e=>{e.preventDefault();setMonth(monthPicker.value)};
$('prevMonth').onclick=()=>{const d=new Date(currentMonth+'-01T12:00:00');d.setMonth(d.getMonth()-1);setMonth(d.toISOString().slice(0,7))};
$('nextMonth').onclick=()=>{const d=new Date(currentMonth+'-01T12:00:00');d.setMonth(d.getMonth()+1);setMonth(d.toISOString().slice(0,7))};
cancelEdit.onclick=resetEdit;
$('editForm').onsubmit=async e=>{e.preventDefault();if(!editingId)return;const row={expense_date:editDate.value,category:editCategory.value,description:editDetail.value.trim(),amount:parse(editAmount.value),paid_by:editPaidBy.value};if(!row.amount){$('editMsg').textContent='Ingresá un importe válido.';return}const r=await db.from('household_expenses').update(row).eq('id',editingId);if(r.error){$('editMsg').textContent=r.error.message;return}$('editMsg').textContent='Gasto actualizado.';resetEdit();await loadExpenses()};
['totoIncome','rocioIncome','amount','editAmount'].forEach(id=>$(id).addEventListener('input',e=>formatField(e.target)));
db.auth.getSession().then(r=>{if(r.data.session)show()});

if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js");
