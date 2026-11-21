import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../../',import.meta.url);
const ft=fs.readFileSync(new URL('full_training.html',root),'utf8');
const pat=fs.readFileSync(new URL('patrimonio.html',root),'utf8');
function between(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`No se encontró ${start}`);
  return source.slice(a,b);
}
function context(source,globals={}){
  const ctx=vm.createContext({console,structuredClone,...globals});
  vm.runInContext(source,ctx);
  return ctx;
}
const money=v=>v==null||v===''?NaN:Number(String(v).replace(',','.'));

test('dividendos y transferencias no afectan al resultado, y PRESTEC solo al resultado después',()=>{
  const ctx=context(between(ft,'const FT_TRANSFER_CATS','const SEED_CLIENTS'));
  const gastos=[
    {desc:'Alquiler',cat:'instalaciones',amount:500},
    {desc:'DIVIS SERGIO',cat:'dividendos',amount:8575},
    {desc:'DIVIS GERARD',cat:'dividendos',amount:8925},
    {desc:'PRESTEC',cat:'financiero',amount:968.06},
    {desc:'Traspaso',cat:'inversion_aporte',amount:1000},
    {desc:'Reembolso',cat:'inversion_retiro',amount:300,direction:'credit'}
  ];
  const expense=mode=>gastos.filter(g=>ctx.isOperatingExpense(g,mode)).reduce((s,g)=>s+g.amount,0);
  assert.equal(expense('before'),500);
  assert.equal(expense('after'),1468.06);
  assert.equal(ctx.confirmedLoanTotal({gastos}),968.06);
  assert.equal(10000-expense('before'),9500);
  assert.equal(10000-expense('after'),8531.94);
  assert.equal(ctx.effectiveGastoCat({desc:'PRESTEC',cat:'traspaso_interno'}),'traspaso_interno');
});

test('la gráfica de inversiones usa solo depósitos guardados y NAV original, sin leer gastos',()=>{
  const months={
    '2026-01':{gastos:[{cat:'inversion_aporte',amount:1000}],meta:{inversiones:4000}},
    '2026-02':{gastos:[{cat:'inversion_aporte',amount:500},{cat:'inversion_retiro',amount:200}],meta:{inversiones:4500}}
  };
  const ctx=context(between(ft,'function validInvestmentDate','let _dashCharts'),{db:{months}});
  assert.equal(ctx.investmentStatsAt('2026-01').deposited,null);
  assert.equal(ctx.investmentStatsAt('2026-01').market,4000);
  ctx.db.investmentMovements=[
    {id:'a',date:'2026-01-20',amount:50000,type:'deposit'},
    {id:'b',date:'2026-02-15',amount:1000,type:'withdrawal'}
  ];
  assert.equal(ctx.investmentStatsAt('2025-12').deposited,null);
  assert.equal(ctx.investmentStatsAt('2026-01').deposited,50000);
  assert.equal(ctx.investmentStatsAt('2026-02').deposited,49000);
  assert.equal(ctx.investmentStatsAt('2026-02').market,4500);
  assert.equal(months['2026-02'].gastos.length,2);
});

test('el panel permite alta, edición y borrado sin alterar NAV, gastos ni capital previo',()=>{
  const months={'2026-01':{gastos:[{id:'g1',amount:950,cat:'financiero'}],meta:{inversiones:82500}}};
  const db={months,investmentBasis:{month:'2026-01',amount:70000,complete:true}};
  const original=structuredClone(db);
  const nodes=Object.fromEntries(['investmentMoveDate','investmentMoveAmount','investmentMoveType','investmentMoveError','investmentMoveSave','investmentMoveCancel','investmentMovesPanel'].map(id=>[id,{value:'',textContent:'',classList:{add(){},remove(){}},open:false}]));
  let saves=0;
  const ctx=context(between(ft,'function validInvestmentDate','let _dashCharts')+between(ft,'let editInvestmentMoveId=null','function openGastoModal'),{
    db,document:{getElementById:id=>nodes[id]},curKey:()=> '2026-01',uid:()=> 'mov1',save:()=>{saves++;},
    renderInvestmentMovements:()=>{},toast:()=>{},confirm:()=>true,fmt:v=>String(v)
  });
  ctx.renderInvestmentMovements=()=>{};
  nodes.investmentMoveDate.value='2026-01-20';nodes.investmentMoveAmount.value='50000';nodes.investmentMoveType.value='deposit';
  ctx.saveInvestmentMovement();
  assert.equal(saves,1);assert.equal(db.investmentMovements.length,1);
  nodes.investmentMoveDate.value='2026-01-20';nodes.investmentMoveAmount.value='50000';nodes.investmentMoveType.value='deposit';
  ctx.saveInvestmentMovement();assert.equal(saves,1);assert.match(nodes.investmentMoveError.textContent,/ya está registrado/);
  nodes.investmentMoveDate.value='2026-02-30';nodes.investmentMoveAmount.value='1';
  ctx.saveInvestmentMovement();assert.equal(saves,1);assert.equal(db.investmentMovements.length,1);
  ctx.editInvestmentMovement('mov1');nodes.investmentMoveAmount.value='51000';ctx.saveInvestmentMovement();
  assert.equal(saves,2);assert.equal(db.investmentMovements[0].amount,51000);
  assert.equal(ctx.investmentStatsAt('2026-01').deposited,51000);
  ctx.deleteInvestmentMovement('mov1');assert.equal(saves,3);assert.equal(db.investmentMovements.length,0);
  ctx.save=()=>{throw new Error('No se pudo guardar');};
  nodes.investmentMoveDate.value='2026-01-20';nodes.investmentMoveAmount.value='51000';
  ctx.saveInvestmentMovement();assert.equal(db.investmentMovements.length,0);
  assert.deepEqual(db.months,original.months);assert.deepEqual(db.investmentBasis,original.investmentBasis);
});

test('la tarjeta de beneficio conserva la presentación anterior y no ofrece selector de financiación',()=>{
  assert.match(ft,/<div class="card"><div class="card-title">Beneficio mensual<\/div><div style="height:180px;"><canvas id="cBen"><\/canvas><\/div><\/div>/);
  assert.doesNotMatch(ft,/dashFinanceMode|setDashFinanceMode|Criterio del beneficio/);
  assert.match(ft,/Inversiones · NAV y capital depositado/);
});

test('CSV de abonos permite retiradas internas sin convertirlas en facturación',()=>{
  const src=between(ft,'function parseExtractoRows','function openImportPreview');
  const ctx=context(src,{
    _norm:v=>String(v).toLowerCase(),
    _parseAmount:v=>v===''||v==null?null:Number(v),
    _parseDate:v=>v,
    _guessCols:()=>({date:-1,conc:-1,amt:-1,deb:-1,cre:-1})
  });
  const rows=[['Fecha','Concepto','Cargo','Abono'],['2026-01-01','Aporte','100',''],['2026-01-02','Retirada','','250']];
  const result=ctx.parseExtractoRows(rows);
  assert.equal(result.length,2);
  assert.deepEqual(Array.from(result,r=>r.direction),['debit','credit']);
  assert.deepEqual(Array.from(result,r=>r.amount),[100,250]);
});

test('el ajuste antiguo se revierte al leer, y doce meses son calendario consecutivo',()=>{
  const training={months:{
    '2025-01':{entries:[{price:2000}],gastos:[{desc:'PRESTEC',cat:'financiero',amount:950},{cat:'dividendos',amount:17500},{cat:'otros',amount:200}],meta:{caja:1000,inversiones:2000,deuda:500}}
  }};
  const FTRecords={allowed:n=>n==='training',values:new Map([['training',{ft_v4:training}]])};
  const fixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-20T00:00:00Z']));}};
  const src=between(pat,'function originalCompanyBenefit','function defaultSections')+
    between(pat,'function calcEmpParts','// ── Calcular rentabilidad');
  const ctx=context(src,{parseMoneyValue:money,fmt:v=>String(v),window:{FTRecords},FTRecords,Date:fixedDate});
  const entry={year:2025,month:0,key:'2025-0',emp_ben_mes:'1701.51',_loan95151Sep2024:true,emp_caja:'2500'};
  assert.equal(ctx.originalCompanyBenefit(entry),750);
  assert.equal(ctx.originalCompanyBenefit(entry),750);
  const p={entries:[entry,{year:2024,month:11,key:'2024-11',emp_ben_mes:'999'}],empresaSection:{per:4,participacion:49}};
  const info=ctx.calcBen12Info(entry,p);
  assert.equal(info.count,2);
  assert.equal(info.sum,2799);
  assert.equal(info.provisional,true);
  assert.equal(info.manualFallback,true);
  assert.equal(ctx.trainingCompanySnapshot('2025-01').before,1800);
  const valuation=ctx.calcEmpParts(entry,p);
  assert.equal(valuation.cajaTotal,2500);
  assert.equal(valuation.provisional,true);
  assert.equal(valuation.total,(2799*4+2500)*0.49);
  ctx.FTRecords.allowed=()=>false;
  assert.equal(ctx.trainingCompanySnapshot('2025-01'),null);
  const historical={entries:[{year:2023,month:11,emp_ben_mes:'9999'},...Array.from({length:12},(_,month)=>month===5?null:{year:2024,month,emp_ben_mes:'100'}).filter(Boolean)]};
  const december=historical.entries.at(-1);
  const exact=ctx.calcBen12Info(december,historical);
  assert.equal(exact.count,11);
  assert.equal(exact.sum,1100);
  assert.equal(exact.provisional,true);
});

test('editar con Empresa oculta conserva Empresa, aportaciones, activos archivados y campos desconocidos',()=>{
  const old={key:'2026-0',year:2026,month:0,assets:{a:'10',arch:'99'},_activeAssets:['a','arch'],emp_ben_mes:'1701.51',_loan95151Sep2024:true,emp_caja:'700',contributions:{a:500},unknown:{keep:true},note:'antes'};
  const p={entries:[structuredClone(old)],empresaSection:{enabled:false}};
  const els={fMonth:{value:'0'},fYear:{value:'2026'},formFields:{_activeState:{a:true}},fi_a:{value:'20'},fi_deuda:{value:'5'},fi_note:{value:'después'}};
  const ctx=context(between(pat,'function submitForm','function delEntry'),{
    prof:()=>p,document:{getElementById:id=>els[id]||null},editKey:'2026-0',
    profileAssets:()=>[{id:'a'},{id:'arch',archived:true}],activeAssetsOf:()=>[{id:'a'}],
    parseMoneyValue:money,save:()=>{},toast:()=>{},showTab:()=>{},confirm:()=>true,MO:['Ene']
  });
  ctx.submitForm();ctx.editKey='2026-0';ctx.submitForm();
  const e=p.entries[0];
  assert.equal(e.assets.a,'20');assert.equal(e.assets.arch,'99');
  assert.deepEqual(Array.from(e._activeAssets),['a','arch']);
  assert.equal(e.emp_ben_mes,'1701.51');assert.equal(e.emp_caja,'700');
  assert.equal(e._loan95151Sep2024,true);
  assert.equal(e.contributions.a,500);assert.equal(e.unknown.keep,true);
  assert.equal(e.note,'después');
});

test('la proyección acepta 0 % y parte del último cierre, no del año actual',()=>{
  const kpis={innerHTML:''},table={innerHTML:''};
  const els={projKpis:kpis,projTable:table,proj_rate:{value:'0'},proj_extra:{value:'0'},proj_horizon:{value:'1'}};
  const entry={year:2025,month:9};
  const ctx=context(between(pat,'function renderProjections','function renderAjustes'),{
    prof:()=>({objectives:[]}),completeEntries:()=>[entry],calcPat:()=>100000,
    document:{getElementById:id=>els[id]||null},fmt:v=>`${v} €`,fPct:v=>`${v}%`,
    MO:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
    dChart:()=>{},charts:{},Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-11-20T00:00:00Z']));}}
  });
  ctx.renderProjections();
  assert.match(kpis.innerHTML,/0%\/año/);
  assert.match(table.innerHTML,/Oct 2026/);
  assert.match(table.innerHTML,/100000 €/);
  assert.doesNotMatch(table.innerHTML,/2027/);
});

test('un traspaso a una cartera nueva no crea una caída ficticia en el total de carteras',()=>{
  const assets=[{id:'vieja',archived:true},{id:'nueva'}];
  const ctx=context(between(pat,'function portfolioTotalAt','function ingValue'),{
    entryActiveAssets:e=>assets.filter(a=>e._activeAssets.includes(a.id)),
    isPortfolioAsset:()=>true,parseMoneyValue:money
  });
  const before={_activeAssets:['vieja'],assets:{vieja:'100'}};
  const after={_activeAssets:['nueva'],assets:{nueva:'100'}};
  assert.equal(ctx.portfolioTotalAt(before,{}),100);
  assert.equal(ctx.portfolioTotalAt(after,{}),100);
});

test('Patrimonio muestra el cambio anual observado aunque cambie la cartera activa',()=>{
  const entries=[
    {year:2024,month:11,assets:{anterior:100}},
    {year:2025,month:0,assets:{nueva:150}},
    {year:2025,month:11,assets:{nueva:200}}
  ];
  const p={entries,empresaSection:{enabled:false}};
  const selector={value:'__total',innerHTML:''},table={innerHTML:''};
  const ctx=context(between(pat,'function renderAssetYearComparison','function resetForm'),{
    prof:()=>p,completeEntries:()=>entries,showArchivedHistory:()=>false,
    dashboardAssetsOf:()=>[{id:'nueva',name:'Nueva',color:'#60a5fa'}],isPortfolioAsset:()=>true,
    assetLabel:a=>a.name,esc:v=>v,document:{getElementById:id=>({assetYearSelector:selector,assetYearTable:table})[id]},
    parseMoneyValue:money,calcPat:e=>Object.values(e.assets).reduce((sum,v)=>sum+v,0),
    fmt:v=>`${v} €`,fPct:v=>`${v}%`,Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-11-22T00:00:00Z']));}}
  });
  ctx.renderAssetYearComparison();
  assert.match(table.innerHTML,/2025/);
  assert.match(table.innerHTML,/100 €/);
  assert.match(table.innerHTML,/100%/);
});

test('se recupera el análisis de gastos sin reintroducir aportaciones ni textos de provisional',()=>{
  for(const id of ['dashGastosKpis','dashGastosRange','cGastosLines','cGastosCats'])assert.match(pat,new RegExp(`id="${id}"`));
  assert.match(between(pat,'function renderCharts(p)','function renderInteranual'),/renderDashGastosCharts\(\)/);
  assert.doesNotMatch(pat,/Aportaciones \/ Retiros \(opcional\)|Alcance distinto \/ pendiente|Valoración mi parte\$\{parts\?\.provisional/);
});

test('el mes abierto y el mes sin carteras personales no simulan un cierre patrimonial',()=>{
  const DateAtNovember=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-20T00:00:00Z']));}};
  const ctx=context(between(pat,'function isEntryComplete','function showScreen'),{
    Date:DateAtNovember,entryActiveAssets:()=>[{id:'cartera'}],isIncomeAsset:()=>false,
    parseMoneyValue:money,calcEmp:()=>121280
  });
  const profile={empresaSection:{enabled:true},entries:[
    {year:2026,month:9,assets:{cartera:150000}},
    {year:2026,month:10,assets:{},emp_caja:95000}
  ]};
  assert.equal(ctx.isEntryComplete(profile.entries[1],profile),false);
  assert.deepEqual(Array.from(ctx.completeEntries(profile),e=>e.month),[9]);
  profile.entries[1].assets.cartera=151000;
  assert.equal(ctx.isEntryComplete(profile.entries[1],profile),true);
  assert.deepEqual(Array.from(ctx.completeEntries(profile),e=>e.month),[9]);
});
