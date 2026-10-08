/*
 * Facturas del mes — Motor de lectura V2
 * Diseño por capas:
 * 1) extracción del documento
 * 2) normalización
 * 3) detección de empresa
 * 4) perfiles por empresa
 * 5) validación + confianza
 *
 * No guarda nada y nunca decide por el usuario: devuelve candidatos + evidencia.
 */

const cleanSpaces = s => String(s ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();

const normalize = s => cleanSpaces(s)
  .replace(/[óòö]/gi, m => m === m.toUpperCase() ? 'O' : 'o')
  .replace(/[áàä]/gi, m => m === m.toUpperCase() ? 'A' : 'a')
  .replace(/[éèë]/gi, m => m === m.toUpperCase() ? 'E' : 'e')
  .replace(/[íìï]/gi, m => m === m.toUpperCase() ? 'I' : 'i')
  .replace(/[úùü]/gi, m => m === m.toUpperCase() ? 'U' : 'u')
  .replace(/\s+Cliente\s*:/gi, ' Cliente: ')
  .replace(/\s+Vencimiento\s*:/gi, ' Vencimiento: ');

const linesOf = text => normalize(text).split('\n').map(x => x.trim()).filter(Boolean);

function candidate(value, confidence, evidence, source='profile'){
  return value ? {value:String(value).trim(), confidence, evidence, source} : null;
}
function first(...xs){ return xs.find(Boolean) || null; }
function dateISO(s){
  const m=String(s||'').match(/(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(20\d{2})/);
  if(!m)return '';
  return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
}
function moneyAR(s){
  const raw=String(s||'').replace(/\s/g,'').replace(/\$/g,'');
  if(!raw)return '';
  // Facturas argentinas o PDFs que usan punto decimal: devolver siempre número
  // normalizado para que la UI pueda formatearlo.
  if(/\d{1,3}(?:[.,]\d{3})+\.\d{2}$/.test(raw)){
    return Number(raw.replace(/,/g,''));
  }
  if(/\d{1,3}(?:\.\d{3})+,\d{2}$/.test(raw)){
    return Number(raw.replace(/\./g,'').replace(',','.'));
  }
  if(/\d+,\d{2}$/.test(raw)) return Number(raw.replace(',','.'));
  if(/^\d+\.\d{2}$/.test(raw)) return Number(raw);
  const n=Number(raw.replace(/,/g,''));
  return Number.isFinite(n) ? n : 0;
}

function detectCompany(text){
  const u=normalize(text).toUpperCase();
  if(/\bEDESUR\b/.test(u) || /DISTRIBUIDORA DE ENERG[IÍ]A SUR/.test(u) || /CUIT\s*:?\s*30-65511651-2/.test(u) || (/LIQUIDACI[ÓO]N\s+DE\s+SERVICIOS\s+P[ÚU]BLICOS/.test(u) && /N[°º]\s*DE\s*MEDIDOR/.test(u) && /C[ÓO]DIGO\s+CESP/.test(u))) return {company:'Edesur',service:'Luz',confidence:.99};
  if(/\bMETROGAS\b/.test(u)) return {company:'MetroGAS',service:'Gas',confidence:.99};
  if(/\bAYSA\b|AGUA Y SANEAMIENTOS ARGENTINOS/.test(u)) return {company:'AySA',service:'Agua',confidence:.98};
  if(/\bARBA\b/.test(u)) return {company:'ARBA',service:'ARBA departamento',confidence:.98};
  if(/\bARLO\b|AGENCIA DE RECAUDACI[ÓO]N\s+LOMAS\s+DE\s+ZAMORA|MUNICIPALIDAD\s+DE\s+LOMAS\s+DE\s+ZAMORA|LOMAS\s+DE\s+ZAMORA/.test(u)) return {company:'ARLO',service:'Municipal',confidence:.99};
  if(/MUNICIPAL/.test(u)) return {company:'Municipal',service:'Municipal',confidence:.80};
  if(/\bPERSONAL\b|\bMOVISTAR\b|\bCLARO\b|\bTELECENTRO\b/.test(u)) return {company:'',service:'Internet',confidence:.60};
  return {company:'',service:'Otro',confidence:0};
}

function parseEdesur(text){
  const t=normalize(text);
  const lines=linesOf(t);
  const out={};

  // Edesur: el PDF puede variar entre "Cliente: 04811778",
  // "Cliente : 04811778" o incluso separar los elementos del texto.
  const account=first(
    t.match(/Cliente\s*:?\s*(\d{6,12})/i),
    t.match(/Cliente\s*N[°º]?\s*:?\s*(\d{6,12})/i),
    t.match(/Cliente[^0-9]{0,40}(\d{6,12})/i),
    t.match(/C\s*:?\s*(\d{6,12})/i)
  );
  if(account) out.account=candidate(account[1],.99,'Cliente / Cliente N°','Edesur');

  // Titular: priorizamos la misma línea que contiene "Cliente".
  // Ejemplo real: "COSTA VILLARREALJULIA ELENA Cliente: 04811778".
  const clientLine=lines.find(x=>/Cliente\s*(?:N[°º]?\s*)?:?\s*\d{6,12}/i.test(x));
  if(clientLine){
    const before=clientLine.split(/Cliente\s*(?:N[°º]?\s*)?:?\s*\d{6,12}/i)[0]
      .replace(/^[^A-ZÁÉÍÓÚÑ]*/i,'')
      .replace(/\s+/g,' ')
      .trim();
    if(before.length>=5 && !/[0-9]/.test(before)){
      out.holder=candidate(before,.99,'Titular en la línea de Cliente de Edesur','Edesur');
    }
  }

  // Fallback para PDF.js cuando "Cliente" y el número aparecen separados.
  if(!out.holder){
    const ci=t.search(/Cliente\s*:?\s*\d{6,12}/i);
    if(ci>0){
      const before=t.slice(Math.max(0,ci-100),ci).replace(/\s+/g,' ').trim();
      const m=before.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{4,})$/i);
      if(m && !/[0-9]/.test(m[1])) out.holder=candidate(m[1].trim(),.96,'Texto inmediatamente anterior a Cliente','Edesur');
    }
  }

  // Último fallback: en el encabezado de Edesur, el titular aparece
  // antes de la dirección y después del encabezado LSP.
  const lsp=lines.findIndex(x=>/LIQUIDACI[ÓO]N\s+DE\s+SERVICIOS\s+P[ÚU]BLICOS/i.test(x));
  if(!out.holder && lsp>=0){
    for(let i=lsp+1;i<Math.min(lines.length,lsp+8);i++){
      const x=lines[i].trim();
      if(!x || /^N[°º]\s*DE\s*MEDIDOR/i.test(x)) continue;
      if(/^\d{6,12}$/.test(x) || /Cliente\s*:/i.test(x)) continue;
      if(/^(ESPORA|LOMAS DE ZAMORA|TEMPERLEY|SE:|ALIMENTADOR:|CT:|PLAN:|SUC:|RAD:|REC:)/i.test(x)) continue;
      if(!/[0-9]/.test(x) && x.length>=5){
        out.holder=candidate(x.replace(/\s+/g,' ').trim(),.99,'Bloque titular de Edesur','Edesur');
        break;
      }
    }
  }

  const issue=first(
    t.match(/Capital Federal\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i),
    t.match(/Capital Federal\s+(\d{1,2}\s*[\/-]\s*\d{1,2}\s*[\/-]\s*\d{4})/i)
  );
  if(issue) out.issue=candidate(dateISO(issue[1]),.98,'Capital Federal + fecha','Edesur');

  const due=first(
    t.match(/1\s*[°ºo]\s*Vencimiento\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i),
    t.match(/Total a pagar hasta\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i)
  );
  if(due) out.due=candidate(dateISO(due[1]),.99,'Primer vencimiento','Edesur');

  const invoice=first(
    t.match(/(?:FACTURA|N[°º]\s*DE\s*FACTURA|COMPROBANTE)\s*(?:N[°º]\s*)?[:#-]?\s*([A-Z]-\d{4}-\d{6,10})/i),
    t.match(/\b([A-Z]-\d{4}-\d{6,10})\b/i),
    t.match(/(?:FACTURA|N[°º]\s*DE\s*FACTURA|COMPROBANTE)\s*(?:N[°º]\s*)?[:#-]?\s*([0-9]{1,5}[- ]?[0-9]{6,10})/i),
    t.match(/([0-9]{4,5}-[0-9]{6,10})/)
  );
  if(invoice) out.invoice=candidate(invoice[1],.95,'Número de factura/comprobante','Edesur');

  const amount=first(
    t.match(/TOTAL\s+A\s+PAGAR\s*\(\s*1\s*[°ºo]\s*vencimiento\s*\)\s*\$\s*([0-9.,]+)/i),
    t.match(/Total a pagar hasta\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\s*\$\s*([0-9.,]+)/i)
  );
  if(amount) out.amount=candidate(moneyAR(amount[1]),.99,'TOTAL A PAGAR (1° vencimiento)','Edesur');

  return out;
}

function parseMetroGas(text){
  const t=normalize(text);
  const lines=linesOf(t);
  const out={};

  const amount=t.match(/TOTAL\s+A\s+PAGAR\s*\$?\s*([0-9.]+,[0-9]{2})/i);
  if(amount)out.amount=candidate(moneyAR(amount[1]),.99,'TOTAL A PAGAR','MetroGAS');

  const due=t.match(/FECHA\s+DE\s+VENCIMIENTO\s*:\s*([^\n]+)/i);
  if(due)out.due=candidate(dateISO(due[1]),.99,'FECHA DE VENCIMIENTO','MetroGAS');

  const issue=t.match(/FECHA\s+DE\s+EMISI[ÓO]N\s*:\s*([^\n]+)/i);
  if(issue)out.issue=candidate(dateISO(issue[1]),.99,'FECHA DE EMISIÓN','MetroGAS');

  const invoice=first(
    t.match(/\b([A-Z]-\d{4}-\d{6,10})\b/i),
    t.match(/(?:FACTURA|COMPROBANTE)\s*(?:N[°º]\s*)?[:#-]?\s*([0-9]{4,5}-[0-9]{6,10})/i)
  );
  if(invoice)out.invoice=candidate(invoice[1],.99,'Número de factura/comprobante','MetroGAS');

  const period=t.match(/PERIODO\s+DE\s+LIQUIDACI[ÓO]N\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s+A\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i);
  if(period){
    out.periodStart=candidate(dateISO(period[1]),.99,'Período de liquidación — inicio','MetroGAS');
    out.periodEnd=candidate(dateISO(period[2]),.99,'Período de liquidación — fin','MetroGAS');
  }

  const ci=first(
    t.match(/N[ÚU]MERO\s+DE\s+CLIENTE\s*[:#-]?\s*(\d{6,14})/i),
    t.match(/N[°º]?\s*DE\s*CLIENTE\s*[:#-]?\s*(\d{6,14})/i),
    t.match(/CLIENTE\s*N[°º]?\s*[:#-]?\s*(\d{6,14})/i),
    t.match(/CLIENTE\s*[:#-]\s*(\d{6,14})/i)
  );
  if(ci)out.account=candidate(ci[1],.99,'Número de cliente de MetroGAS','MetroGAS');

  // En las facturas MetroGAS el rótulo y el número suelen venir
  // separados en líneas distintas:
  // "Número de cliente" / "30012204301".
  if(!out.account){
    // MetroGAS puede posicionar el número con coordenadas PDF de forma que
    // PDF.js lo mezcle con otros elementos. Buscamos el número inmediatamente
    // después de la etiqueta, incluso si quedó en otra "fila" de texto.
    const near=t.match(/N[ÚU]MERO\s+DE\s+CLIENTE[\s\S]{0,120}?\b(\d{11})\b/i);
    if(near){
      out.account=candidate(near[1],.99,'Número de cliente próximo a su etiqueta','MetroGAS');
    }
  }

  if(!out.account){
    const clientLabel=lines.findIndex(x=>/N[ÚU]MERO\s+DE\s+CLIENTE/i.test(x));
    if(clientLabel>=0){
      for(let i=clientLabel+1;i<Math.min(lines.length,clientLabel+6);i++){
        const x=lines[i].replace(/\s+/g,'').trim();
        if(/^\d{6,14}$/.test(x)){
          out.account=candidate(x,.99,'Número debajo de la etiqueta Número de cliente','MetroGAS');
          break;
        }
      }
    }
  }

  // Titular de MetroGAS: en PDFs reales aparece ANTES del bloque
  // "Número de cliente", por ejemplo:
  // "AMELIA ELENA VILLAREAL" seguido de la dirección.
  // Lo buscamos primero por etiquetas de titular/dirección y luego
  // por el bloque inmediatamente anterior a "Número de cliente".
  const clientIdx=lines.findIndex(x=>/Número\s+de\s+cliente/i.test(x));
  if(clientIdx>0 && !out.holder){
    for(let i=Math.max(0,clientIdx-8);i<clientIdx;i++){
      const x=lines[i].replace(/\s+/g,' ').trim();
      if(!x || /MetroGAS|LIQUIDACION|RESPONSABLE|CUIT|IVA|TIPO DE CLIENTE|TARIFA|INTERLOCUTOR/i.test(x)) continue;
      if(/^\d/.test(x) || /\d{3,}/.test(x)) continue;
      if(/^[A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+){1,8}$/.test(x)){
        out.holder=candidate(x,.99,'Titular antes de Número de cliente','MetroGAS');
        break;
      }
    }
  }

  // Fallback: algunos PDFs ponen el titular en una línea cercana al
  // encabezado y no mantienen el mismo orden visual.
  if(!out.holder){
    const holderLabel=first(
      t.match(/(?:TITULAR|CLIENTE)\s*[:#-]\s*([^\n]+)/i),
      t.match(/(?:NOMBRE\s+DEL\s+CLIENTE|NOMBRE\s+Y\s+APELLIDO)\s*[:#-]\s*([^\n]+)/i)
    );
    if(holderLabel){
      const x=holderLabel[1].trim();
      if(x && !/^\d/.test(x)) out.holder=candidate(x,.95,'Etiqueta de titular de MetroGAS','MetroGAS');
    }
  }
  return out;
}

function parseArlo(text){
  const t=normalize(text);
  const lines=linesOf(t);
  const out={};

  const liquidation=first(
    t.match(/N[°º]\.?\s*Liq\.?\s*[:#-]?\s*(\d+\s*-\s*\d+\s*-\s*\d+)/i),
    t.match(/N[°º]\.?\s*Liquidaci[óo]n\s*[:#-]?\s*(\d+\s*-\s*\d+\s*-\s*\d+)/i)
  );
  if(liquidation){
    const value=liquidation[1].replace(/\s+/g,'');
    out.invoice=candidate(value,.99,'N° Liq. de ARLO','ARLO');
  }

  const account=first(
    t.match(/N[°º]\.?\s*Liq\.?\s*[0-9\s-]+\s+Cuenta\s+(\d{5,12})/i),
    t.match(/Cuenta\s*[:#-]?\s*(\d{5,12})/i)
  );
  if(account) out.account=candidate(account[1],.99,'Cuenta de ARLO','ARLO');

  const holder=t.match(/Contribuyente\s+([^\n]+?)(?=\s+Domicilio|$)/i);
  if(holder){
    const value=holder[1].trim();
    if(value) out.holder=candidate(value,.99,'Contribuyente de ARLO','ARLO');
  }

  const issue=t.match(/Fecha\s+Emisi[óo]n\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if(issue) out.issue=candidate(dateISO(issue[1]),.99,'Fecha Emisión de ARLO','ARLO');

  const due=t.match(/Vencimiento\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if(due) out.due=candidate(dateISO(due[1]),.99,'Vencimiento de ARLO','ARLO');

  const amount=first(
    t.match(/Importe\s+a\s+pagar\s+\$?\s*([0-9.,]+)/i),
    t.match(/TOTAL\s+\$?\s*[0-9.,]+\s+[0-9.,]+\s+([0-9.,]+)/i)
  );
  if(amount) out.amount=candidate(moneyAR(amount[1]),.99,'Importe a pagar de ARLO','ARLO');

  return out;
}

function parseGeneric(text){
  const t=normalize(text), lines=linesOf(text), out={};

  const invoice=first(
    t.match(/(?:FACTURA|N[°º]\s*DE\s*FACTURA|COMPROBANTE)\s*(?:N[°º]\s*)?[:#-]?\s*([0-9]{1,5}[- ]?[0-9]{6,10})/i),
    t.match(/([0-9]{4,5}-[0-9]{6,10})/)
  );
  if(invoice) out.invoice=candidate(invoice[1],.85,'Número de factura/comprobante','generic');

  const period=t.match(/PERIODO\s+DE\s+LIQUIDACI[ÓO]N\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s+A\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i);
  if(period){
    out.periodStart=candidate(dateISO(period[1]),.99,'Período de liquidación — inicio','generic');
    out.periodEnd=candidate(dateISO(period[2]),.99,'Período de liquidación — fin','generic');
  }

  const total=first(
    t.match(/TOTAL\s+A\s+PAGAR[^\d$]{0,40}\$?\s*([0-9.,]+)/i),
    t.match(/TOTAL[^\d$]{0,30}\$?\s*([0-9.,]+)/i)
  );
  if(total)out.amount=candidate(moneyAR(total[1]),.75,'Etiqueta TOTAL','generic');

  const due=t.match(/(?:VENCIMIENTO|FECHA\s+DE\s+VENCIMIENTO)[^\d]{0,30}(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i);
  if(due)out.due=candidate(dateISO(due[1]),.75,'Etiqueta de vencimiento','generic');

  const issue=t.match(/(?:EMISI[ÓO]N|FECHA\s+DE\s+EMISI[ÓO]N)[^\d]{0,30}(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i);
  if(issue)out.issue=candidate(dateISO(issue[1]),.75,'Etiqueta de emisión','generic');

  const account=first(
    t.match(/(?:N[ÚU]MERO\s+DE\s+CLIENTE|N[ÚU]MERO\s+DE\s+CUENTA|CLIENTE\s*N[°º]?|CUENTA)\s*[:#-]?\s*(\d{6,14})/i),
    t.match(/(?:P[ÓO]LIZA|UNIDAD)\s*[:#-]?\s*(\d{5,14})/i)
  );
  if(account)out.account=candidate(account[1],.70,'Referencia de cliente/cuenta/póliza','generic');

  const holder=first(
    t.match(/(?:TITULAR|CLIENTE|CONTRIBUYENTE|RAZ[ÓO]N\s+SOCIAL|NOMBRE\s+Y\s+APELLIDO)\s*[:#-]\s*([^\n]+)/i),
    t.match(/(?:SE[ÑN]OR(?:ES)?|SR\.?|SRA\.?)\s+([^\n]+)/i)
  );
  if(holder){
    const value=holder[1].trim();
    if(value&&!/^\d/.test(value))out.holder=candidate(value,.70,'Etiqueta de titular/cliente','generic');
  }

  const supplier=first(
    t.match(/(?:EMPRESA|PROVEEDOR|PRESTADOR|EMISOR)\s*[:#-]\s*([^\n]+)/i),
    t.match(/^(PERSONAL|MOVISTAR|CLARO|TELECENTRO)\b/im)
  );
  if(supplier)out.company=candidate(supplier[1].trim(),.70,'Empresa/proveedor','generic');

  return out;
}

function validate(fields){
  const warnings=[];
  if(fields.amount?.value<=0)warnings.push('No se pudo confirmar el importe.');
  if(!fields.due?.value)warnings.push('No se pudo confirmar el vencimiento.');
  if(!fields.company?.value)warnings.push('No se pudo identificar la empresa.');
  if(!fields.holder?.value)warnings.push('No se pudo confirmar el titular.');
  return {ok:warnings.length===0,warnings};
}

function merge(base, parsed){
  const out={...base};
  for(const [k,v] of Object.entries(parsed)) if(v?.value) out[k]=v;
  return out;
}


function parseExpensas(text,fileName=''){
 const t=normalize(text),lines=linesOf(text),out={};
 const target=lines.find(x=>/17\s*\(\s*C\.14\s*\)\s*6[°º]\s*C/i.test(x));
 if(!target) return out;
 const m=target.match(/^(?:17\s*\(\s*C\.14\s*\))\s*(6[°º]\s*C)\s+(.+?)\s+([0-9]+(?:,[0-9]+)?)\s+([0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+6[°º]C\s*$/i);
 if(!m)return out;
 const holder=m[2].trim();
 out.uf=candidate('17 (C.14)',.99,'Fila de la unidad 6°C','Expensas');
 out.unit=candidate(m[1].replace('º','°'),.99,'Fila de la unidad 6°C','Expensas');
 out.holder=candidate(holder,.99,'Fila de la unidad 6°C','Expensas');
 out.ordinary=candidate(moneyAR(m[8]),.99,'Expensa ordinaria de 6°C','Expensas');
 out.extraordinary=candidate(moneyAR(m[9]),.99,'Expensa extraordinaria de 6°C','Expensas');
 out.amount=candidate(moneyAR(m[11]),.99,'TOTAL A PAGAR de 6°C','Expensas');
 const monthMatch=fileName.match(/(?:SETIEMBRE|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO)/i);
 const names={ENERO:0,FEBRERO:1,MARZO:2,ABRIL:3,MAYO:4,JUNIO:5,JULIO:6,AGOSTO:7,SETIEMBRE:8,SEPTIEMBRE:8,OCTUBRE:9,NOVIEMBRE:10,DICIEMBRE:11};
 let y=new Date().getFullYear();
 if(monthMatch){const mm=names[monthMatch[0].toUpperCase()];out.billMonth=candidate(new Date(y,mm,1).toISOString().slice(0,10),.95,'Mes indicado en el nombre de la liquidación','Expensas');}
 const dueText=t.match(/ABONARs+ANTESs+DELs+D[IÍ]As+(d{1,2})s+DEs+CADAs+MES/i);
 if(dueText){let dueMonth=out.billMonth?.value?new Date(out.billMonth.value+'T12:00:00'):new Date();dueMonth.setMonth(dueMonth.getMonth()+1);const d=new Date(dueMonth.getFullYear(),dueMonth.getMonth(),Number(dueText[1]));out.due=candidate(d.toISOString().slice(0,10),.94,'Forma de pago de expensas','Expensas');out.billMonth=candidate(new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10),.94,'Mes de vencimiento de la expensa','Expensas');}
 return out;
}
export async function readExpensasFile(file,onProgress=()=>{}){
 const doc=await extractDocument(file,onProgress);
 const fields=parseExpensas(doc.text,file.name);
 const validation={warnings:[]};
 if(!fields.unit?.value)validation.warnings.push('No se encontró la fila exacta de la unidad 6°C.');
 if(!fields.amount?.value)validation.warnings.push('No se pudo confirmar el total a pagar de 6°C.');
 return {file,text:doc.text,source:doc.source,pages:doc.pages,fields,validation};
}

export async function extractDocument(file, onProgress=()=>{}){
  if(file.type==='application/pdf'){
    if(!window.pdfjsLib)throw new Error('No se pudo cargar PDF.js');
    const buf=await file.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data:buf,disableWorker:true}).promise;
    let text='';
    for(let p=1;p<=pdf.numPages;p++){
      onProgress('Leyendo PDF — página '+p+' de '+pdf.numPages);
      const page=await pdf.getPage(p);
      const c=await page.getTextContent();
      const items=c.items.map(x=>({str:String(x.str||'').trim(),x:x.transform?.[4]||0,y:x.transform?.[5]||0})).filter(x=>x.str);
      items.sort((a,b)=>b.y-a.y||a.x-b.x);
      const rows=[];
      for(const item of items){
        let row=rows.find(r=>Math.abs(r.y-item.y)<6);
        if(!row){row={y:item.y,items:[]};rows.push(row)}
        row.items.push(item);
      }
      rows.sort((a,b)=>b.y-a.y);
      text+=rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ')).join('\n')+'\n';
    }
    if(text.replace(/\s/g,'').length>80)return {text,source:'pdf-text',pages:pdf.numPages};
    text='';
    for(let p=1;p<=pdf.numPages;p++){
      onProgress('OCR — página '+p+' de '+pdf.numPages);
      const page=await pdf.getPage(p);
      const viewport=page.getViewport({scale:2});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const r=await Tesseract.recognize(canvas,'spa');
      text+=r.data.text+'\n';
    }
    return {text,source:'ocr',pages:pdf.numPages};
  }
  onProgress('OCR — analizando imagen');
  const r=await Tesseract.recognize(file,'spa');
  return {text:r.data.text,source:'ocr',pages:1};
}

export async function readInvoiceFile(file,onProgress=()=>{}){
  const doc=await extractDocument(file,onProgress);
  const detected=detectCompany(doc.text);
  let fields={
    company:candidate(detected.company,detected.confidence,'Detección de empresa','detector'),
    service:candidate(detected.service,detected.confidence,'Detección de servicio','detector')
  };
  const parsed=detected.company==='Edesur' ? parseEdesur(doc.text)
    : detected.company==='MetroGAS' ? parseMetroGas(doc.text)
    : detected.company==='ARLO' ? parseArlo(doc.text)
    : parseGeneric(doc.text);
  fields=merge(fields,parsed);
  const validation=validate(fields);
  return {file,text:doc.text,source:doc.source,pages:doc.pages,fields,validation};
}


/* Export interno para pruebas sintéticas. No modifica el flujo de producción. */
export function __parseTextForTest(text){
  const detected=detectCompany(text);
  const base={
    company:candidate(detected.company,detected.confidence,'Detección de empresa','detector'),
    service:candidate(detected.service,detected.confidence,'Detección de servicio','detector')
  };
  const parsed=detected.company==='Edesur'?parseEdesur(text)
    :detected.company==='MetroGAS'?parseMetroGas(text)
    :detected.company==='ARLO'?parseArlo(text)
    :parseGeneric(text);
  const fields=merge(base,parsed);
  return {detected,fields,validation:validate(fields)};
}
