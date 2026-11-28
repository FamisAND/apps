import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../options.html',import.meta.url),'utf8');
const start=html.indexOf('function riskNum(');
const end=html.indexOf('// INIT — runs at page load',start);
assert.ok(start>0&&end>start,'risk implementation must exist');
const code=html.slice(start,end);
function riskWith(snaps){
  return new Function('SNAPS',`${code}; return {riskRatios,riskReadings,riskSeries,riskMonths,RISK_DEFS};`)(snaps);
}

test('signed theta and delta, and exact dated NAV',()=>{
  const snaps=[{date:'2026-11',val:50000,navEntries:[{ts:'2026-11-04',val:40000}],metrics:[{ts:'2026-11-04',theta:-40,delta:-20,vega:-80,bp:83,spy:650,bpUsed:20000,gamma:8}]}];
  const {riskRatios,riskReadings,RISK_DEFS}=riskWith(snaps);
  const reading=riskReadings()[0],v=riskRatios(reading);
  assert.equal(reading.nav,40000);
  assert.equal(v.theta_nav,-0.1);
  assert.equal(v.delta_10k,-5);
  assert.equal(v.delta_theta,null);
  assert.equal(v.vega_theta,null);
  assert.equal(v.theta_bp,-0.2);
  assert.equal(v.bp_usage,83);
  assert.equal(reading.gamma,8);
  assert.equal(RISK_DEFS.length,6);
});

test('positive theta ratios use SPY and actual BP dollars from the same reading',()=>{
  const {riskRatios}=riskWith([]);
  const v=riskRatios({nav:40000,theta:100,delta:-20,vega:-200,spy:600,bpUsed:20000,bp:50});
  assert.equal(v.theta_nav,0.25);
  assert.equal(v.delta_10k,-5);
  assert.equal(v.delta_theta,1.2);
  assert.equal(v.theta_bp,0.5);
  assert.equal(v.vega_theta,2);
});

test('missing contemporaneous NAV, SPY or BP dollars never yields fabricated ratios',()=>{
  const snaps=[{date:'2026-11',val:50000,metrics:[{ts:'2026-11-04',theta:100,delta:20,vega:40,bp:50}]}];
  const {riskRatios,riskReadings}=riskWith(snaps);
  const r=riskRatios(riskReadings()[0]);
  assert.equal(r.theta_nav,null);
  assert.equal(r.delta_10k,null);
  assert.equal(r.delta_theta,null);
  assert.equal(r.theta_bp,null);
  assert.equal(r.vega_theta,0.4);
  assert.equal(r.bp_usage,50);
});

test('monthly trend averages each valid observation ratio, not monthly raw averages',()=>{
  const snaps=[{date:'2026-11',metrics:[
    {ts:'2026-11-04',nav:10000,theta:10,delta:2,bp:30},
    {ts:'2026-11-18',nav:40000,theta:20,delta:8,bp:40}
  ]}];
  const {riskSeries,riskReadings}=riskWith(snaps);
  const series=riskSeries(riskReadings(),'theta_nav');
  assert.equal(series.length,1);
  assert.equal(series[0].month,'2026-11');
  assert.equal(series[0].n,2);
  assert.ok(Math.abs(series[0].value-0.075)<1e-12);
  assert.deepEqual(snaps[0].metrics.map(m=>m.nav),[10000,40000]);
});

test('risk timeline leaves missing months empty instead of joining distant observations',()=>{
  const snaps=[
    {date:'2026-01',metrics:[{ts:'2026-01-10',theta:20,delta:10,spy:600,bpUsed:10000}]},
    {date:'2026-03',metrics:[{ts:'2026-03-10',theta:25,delta:12,spy:650,bpUsed:12000}]}
  ];
  const {riskReadings,riskSeries,riskMonths}=riskWith(snaps);
  const readings=riskReadings(),series=riskSeries(readings,'delta_theta');
  assert.deepEqual(riskMonths(readings),['2026-01','2026-02','2026-03']);
  assert.deepEqual(riskMonths(readings).map(m=>new Map(series.map(s=>[s.month,s.value])).get(m)??null),[3,null,3.12]);
});
