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

  const ci=t.match(/N[ÚU]MERO\s+DE\s+CLIENTE[^\d]{0,50}(\d{8,12})/i);
  if(ci)out.account=candidate(ci[1],.99,'NÚMERO DE CLIENTE','MetroGAS');

  // El titular se mantiene como candidato independiente: nunca se reemplaza
  // por "Código", "Actividades", IVA u otra etiqueta.
  const idx=lines.findIndex(x=>/METROGAS\s+S\.A\.?/i.test(x));
  if(idx>=0){
    for(let i=idx+1;i<Math.min(lines.length,idx+35);i++){
      const x=lines[i].replace(/\s+/g,' ').trim();
      if(/^\d{8,12}$/.test(x) || /N[ÚU]MERO\s+DE\s+CLIENTE/i.test(x))continue;
      if(/^(ACTIVIDADES|C[ÓO]DIGO|RESPONSABLE|INSCRIPTO|BRUT|IVA|METROGAS)\b/i.test(x))continue;
      if(/^[A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+){1,7}$/.test(x)){
        out.holder=candidate(x,.90,'Bloque superior de MetroGAS','MetroGAS');
        break;
      }
    }
  }
  return out;
}

function parseGeneric(text){
  const t=normalize(text), lines=linesOf(t), out={};
  const total=first(
    t.match(/TOTAL\s+A\s+PAGAR[^\d$]{0,40}\$?\s*([0-9.,]+)/i),
    t.match(/TOTAL[^\d$]{0,30}\$\s*([0-9.,]+)/i)
  );
  if(total)out.amount=candidate(moneyAR(total[1]),.55,'Etiqueta TOTAL','generic');

  const due=first(
    t.match(/(?:VENCIMIENTO|FECHA\s+DE\s+VENCIMIENTO)[^\d]{0,30}(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i)
  );
  if(due)out.due=candidate(dateISO(due[1]),.60,'Etiqueta de vencimiento','generic');

  const issue= t.match(/(?:EMISI[ÓO]N|FECHA\s+DE\s+EMISI[ÓO]N)[^\d]{0,30}(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i);
  if(issue)out.issue=candidate(dateISO(issue[1]),.60,'Etiqueta de emisión','generic');

  const account=t.match(/(?:N[ÚU]MERO\s+DE\s+CLIENTE|N[ÚU]MERO\s+DE\s+CUENTA|CLIENTE\s*N[°º]?)\s*[:#-]?\s*(\d{6,14})/i);
  if(account)out.account=candidate(account[1],.55,'Etiqueta de cliente/cuenta','generic');

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
    : parseGeneric(doc.text);
  fields=merge(fields,parsed);
  const validation=validate(fields);
  return {file,text:doc.text,source:doc.source,pages:doc.pages,fields,validation};
}
