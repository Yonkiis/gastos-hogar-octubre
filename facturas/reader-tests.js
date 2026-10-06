import { __parseTextForTest } from './reader-v2.js';

const names=['JUAN PEREZ','MARIA GOMEZ','SALTICO S.A.'];
const generators={
Edesur:i=>`LIQUIDACIÓN DE SERVICIOS PÚBLICOS
EDESUR
Cliente: ${4800000+i}
${names[i%3]}
Capital Federal ${String(i%28+1).padStart(2,'0')}/10/2026
1° Vencimiento ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL A PAGAR (1° vencimiento) $ ${(37000+i*13).toFixed(2).replace('.',',')}`,
MetroGAS:i=>`METROGAS S.A.
NÚMERO DE CLIENTE
${30012000000+i}
FECHA DE EMISIÓN: ${String(i%28+1).padStart(2,'0')}/10/2026
FECHA DE VENCIMIENTO: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL A PAGAR ${(25000+i*17.35).toFixed(2).replace('.',',')}`,
AySA:i=>`AGUA Y SANEAMIENTOS ARGENTINOS AYSA
TITULAR: ${names[i%3]}
NÚMERO DE CLIENTE: ${100000+i}
FECHA DE EMISIÓN: ${String(i%28+1).padStart(2,'0')}/10/2026
VENCIMIENTO: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL A PAGAR ${(12000+i*9.5).toFixed(2).replace('.',',')}`,
ARBA:i=>`ARBA
RAZÓN SOCIAL: ${names[i%3]}
CUENTA: ${700000+i}
FECHA DE EMISIÓN: ${String(i%28+1).padStart(2,'0')}/10/2026
VENCIMIENTO: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL ${(18000+i*11.2).toFixed(2).replace('.',',')}`,
ARLO:i=>`LIQUIDACIÓN DE TASAS Y DERECHOS MUNICIPALES
N° Liq. 90 - ${4251363+i} - 3 Cuenta ${1892589+i}
Contribuyente ${names[i%3]}
Domicilio LINIERS 106 TEMPERLEY
Fecha Emisión: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL $42,165.80 $5,028.50 ${(47000+i*12.3).toFixed(2)}
Vencimiento ${String(i%28+1).padStart(2,'0')}/10/2026 Importe a pagar ${(47000+i*12.3).toFixed(2)}`,
Internet:i=>`${['PERSONAL','MOVISTAR','CLARO','TELECENTRO'][i%4]}
CLIENTE: ${500000+i}
TITULAR: ${names[i%3]}
FECHA DE EMISIÓN: ${String(i%28+1).padStart(2,'0')}/10/2026
VENCIMIENTO: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL A PAGAR ${(15000+i*8.1).toFixed(2).replace('.',',')}`,
Municipal:i=>`MUNICIPALIDAD
EMPRESA: MUNICIPALIDAD LOCAL
CUENTA: ${800000+i}
CONTRIBUYENTE: ${names[i%3]}
FECHA DE EMISIÓN: ${String(i%28+1).padStart(2,'0')}/10/2026
VENCIMIENTO: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL ${(22000+i*7.2).toFixed(2).replace('.',',')}`,
Expensas:i=>`EXPENSAS
ADMINISTRACIÓN: CONSORCIO ${i+1}
UNIDAD: ${100+i}
TITULAR: ${names[i%3]}
FECHA DE EMISIÓN: ${String(i%28+1).padStart(2,'0')}/10/2026
VENCIMIENTO: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL A PAGAR ${(35000+i*15).toFixed(2).replace('.',',')}`,
Seguro:i=>`SEGURO DE AUTO
PROVEEDOR: ASEGURADORA ${i+1}
PÓLIZA: ${900000+i}
TITULAR: ${names[i%3]}
VENCIMIENTO: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL A PAGAR ${(100000+i*100).toFixed(2).replace('.',',')}`,
Alquiler:i=>`ALQUILER
RAZÓN SOCIAL: LOCADOR ${i+1}
CUENTA: ${600000+i}
TITULAR: ${names[i%3]}
FECHA DE EMISIÓN: ${String(i%28+1).padStart(2,'0')}/10/2026
VENCIMIENTO: ${String(i%28+1).padStart(2,'0')}/10/2026
TOTAL ${(65000+i*100).toFixed(2).replace('.',',')}`
};

let total=0,passed=0,failed=[];
for(const [type,gen] of Object.entries(generators)){
  for(let i=0;i<100;i++){
    total++;
    const f=__parseTextForTest(gen(i)).fields;
    const ok=Number(f.amount?.value)>0 && !!f.due?.value;
    if(ok) passed++; else failed.push({type,i,fields:f});
  }
}
console.log(JSON.stringify({total,passed,failed:failed.length,examples:failed.slice(0,10)},null,2));
if(failed.length) process.exitCode=1;
