const db=window.supabase.createClient('https://xnexfqbcxvrloirhrteo.supabase.co','sb_publishable_S50gnzXMiYfh0O3IyqM6DQ_Kjqvdhlp',{auth:{persistSession:true,autoRefreshToken:true,storageKey:'gastos-hogar-v3'}});
let expenses=[];
let incomes={toto:0,rocio:0};
const month='2026-10';
const login=document.getElementById('login'),app=document.getElementById('app');
const email=document.getElementById('email'),password=document.getElementById('password'),loginForm=document.getElementById('loginForm'),loginMsg=document.getElementById('loginMsg');
const incomeForm=document.getElementById('incomeForm'),incomeMsg=document.getElementById('incomeMsg'),incomeSummary=document.getElementById('incomeSummary');
const totoIncome=document.getElementById('totoIncome'),rocioIncome=document.getElementById('rocioIncome');
const expenseForm=document.getElementById('expenseForm'),expenseMsg=document.getElementById('expenseMsg');
const date=document.getElementById('date'),category=document.getElementById('category'),amount=document.getElementById('amount'),detail=document.getElementById('detail'),paidBy=document.getElementById('paidBy');
const list=document.getElementById('list'),count=document.getElementById('count'),totalEl=document.getElementById('total'),balance=document.getElementById('balance'),logout=document.getElementById('logout');

const money=n=>'$'+Math.round(Number(n)||0).toLocaleString('es-AR');
const percent=n=>Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const parse=v=>Number(String(v||'').replace(/[^0-9]/g,''))||0;

function formatField(el){
 const d=el.value.replace(/[^0-9]/g,'');
 el.value=d?'$'+Number(d).toLocaleString('es-AR'):'';
}

async function loadIncome(){
 const r=await db.from('household_incomes').select('*').eq('month_key',month).maybeSingle();
 if(r.error){incomeMsg.textContent=r.error.message;return}
 if(r.data){
  incomes.toto=Number(r.data.toto_income)||0;
  incomes.rocio=Number(r.data.rocio_income)||0;
  totoIncome.value=incomes.toto?money(incomes.toto):'';
  rocioIncome.value=incomes.rocio?money(incomes.rocio):'';
 }
 renderIncome();
}

async function load(){
 const r=await db.from('household_expenses').select('*').gte('expense_date','2026-10-01').lte('expense_date','2026-10-31').order('created_at',{ascending:true});
 if(r.error){expenseMsg.textContent=r.error.message;return}
 expenses=r.data||[];
 render();
}

function renderIncome(){
 const totalIncome=incomes.toto+incomes.rocio;
 if(!totalIncome){
  incomeSummary.innerHTML='<b>Cargá los dos sueldos para calcular automáticamente el porcentaje de cada uno.</b>';
  balance.innerHTML='';
  return;
 }
 const tp=incomes.toto/totalIncome*100;
 const rp=incomes.rocio/totalIncome*100;
 incomeSummary.innerHTML=
  '<div class="line"><span>Toto cobra</span><b>'+money(incomes.toto)+' · '+percent(tp)+'</b></div>'+
  '<div class="line"><span>Rocío cobra</span><b>'+money(incomes.rocio)+' · '+percent(rp)+'</b></div>'+
  '<div class="line"><span>Ingresos totales</span><b>'+money(totalIncome)+'</b></div>';
 const total=expenses.reduce((s,x)=>s+(Number(x.amount)||0),0);
 renderBalance(total);
}

function render(){
 list.innerHTML='';
 let total=0;
 expenses.forEach(x=>{
  const amountValue=Number(x.amount)||0;
  total+=amountValue;
  const d=document.createElement('div');d.className='expense';
  const top=document.createElement('div');top.className='top';
  const c=document.createElement('b');c.textContent=x.category;
  const a=document.createElement('b');a.textContent=money(amountValue);
  top.append(c,a);
  const det=document.createElement('div');det.className='detail';det.textContent='Detalle: '+(x.description||'Sin detalle');
  const meta=document.createElement('div');meta.className='meta';meta.textContent=x.expense_date+' · Pagó: '+x.paid_by;
  const parts=document.createElement('div');parts.className='meta';
  const ti=incomes.toto+incomes.rocio;
  parts.textContent=ti?'Parte Toto: '+money(amountValue*incomes.toto/ti)+' · Parte Rocío: '+money(amountValue*incomes.rocio/ti):'Cargá los sueldos para calcular las partes.';
  const del=document.createElement('button');del.className='delete';del.textContent='Eliminar';
  del.onclick=async()=>{if(confirm('¿Eliminar este gasto?')){await db.from('household_expenses').delete().eq('id',x.id);await load()}};
  d.append(top,det,meta,parts,del);list.append(d);
 });
 count.textContent='('+expenses.length+')';
 totalEl.textContent=money(total);
 renderBalance(total);
}

function renderBalance(total){
 const ti=incomes.toto+incomes.rocio;
 if(!ti){balance.innerHTML='<b>Faltan los sueldos del mes.</b>';return}
 const totoShare=total*incomes.toto/ti;
 let totoPaid=0,rocioPaid=0;
 expenses.forEach(x=>{if(x.paid_by==='Toto')totoPaid+=Number(x.amount)||0;if(x.paid_by==='Rocío')rocioPaid+=Number(x.amount)||0});
 const diff=totoPaid-totoShare;
 let html=
  '<div class="line"><span>Total de gastos</span><b>'+money(total)+'</b></div>'+
  '<div class="line"><span>Toto debería pagar</span><b>'+money(totoShare)+'</b></div>'+
  '<div class="line"><span>Rocío debería pagar</span><b>'+money(total-totoShare)+'</b></div>'+
  '<div class="line"><span>Toto pagó realmente</span><b>'+money(totoPaid)+'</b></div>'+
  '<div class="line"><span>Rocío pagó realmente</span><b>'+money(rocioPaid)+'</b></div>';
 if(Math.abs(diff)<0.01)html+='<hr><b>Están a mano. No se deben dinero entre ustedes.</b>';
 else if(diff>0)html+='<hr><b>Rocío debe a Toto: '+money(diff)+'</b>';
 else html+='<hr><b>Toto debe a Rocío: '+money(-diff)+'</b>';
 balance.innerHTML=html;
}

loginForm.onsubmit=async e=>{
 e.preventDefault();
 const r=await db.auth.signInWithPassword({email:email.value.trim(),password:password.value});
 if(r.error){loginMsg.textContent=r.error.message;return}
 show();
};

function show(){
 login.classList.add('hide');
 app.classList.remove('hide');
 date.value='2026-10-01';
 Promise.all([loadIncome(),load()]);
}

logout.onclick=async()=>{await db.auth.signOut();location.reload()};

expenseForm.onsubmit=async e=>{
 e.preventDefault();
 const row={expense_date:date.value,category:category.value,description:detail.value.trim(),amount:parse(amount.value),paid_by:paidBy.value};
 const r=await db.from('household_expenses').insert(row).select('*').single();
 if(r.error){expenseMsg.textContent=r.error.message;return}
 expenses.push(r.data);render();
 amount.value='';detail.value='';
 expenseMsg.textContent='Gasto guardado correctamente.';
};

incomeForm.onsubmit=async e=>{
 e.preventDefault();
 const toto=parse(totoIncome.value),rocio=parse(rocioIncome.value);
 const r=await db.from('household_incomes').upsert({month_key:month,toto_income:toto,rocio_income:rocio,updated_at:new Date().toISOString()},{onConflict:'month_key'});
 if(r.error){incomeMsg.textContent=r.error.message;return}
 incomes.toto=toto;incomes.rocio=rocio;
 renderIncome();render();
 incomeMsg.textContent='Ingresos guardados correctamente. El reparto se actualizó.';
};

['totoIncome','rocioIncome','amount'].forEach(id=>document.getElementById(id).addEventListener('input',e=>formatField(e.target)));
db.auth.getSession().then(r=>{if(r.data.session)show()});