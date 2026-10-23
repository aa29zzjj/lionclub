// Only the public official calendar GET endpoint is allowed; never production DB/AWS.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSimulation,seedScenario} from '../tests/helpers/simulation.mjs';
let raw=[];
const sim=await createSimulation({fetcher:async(input,init)=>{
  const u=new URL(input);
  assert.equal(u.origin,'https://www.300a1.org.tw');
  assert.equal(u.pathname,'/activity/getcalendarevents');
  const r=await fetch(u,init);raw=await r.clone().json();return r;
}});
const evidence={at:new Date().toISOString(),scope:'Disposable SQL + real handler; public read-only calendar only; no credentials or production DB',months:[]};
try{
  const s=await seedScenario(sim);const jar=sim.jar();
  assert.equal((await sim.call('/api/auth/login','POST',{email:s.member.email,password:s.password},jar)).status,200);
  for(const[from,to]of[['2026-10-01','2026-11-01'],['2026-11-01','2026-12-01']]){
    try{
      const r=await sim.call(`/api/events/official-calendar?from=${from}&to=${to}`,'GET',undefined,jar);
      assert.equal(r.status,200,JSON.stringify(r.data));
      const events=r.data.events;
      const samples=events.slice(0,5).map(e=>{
        const original=raw.find(x=>x.id===e.id);assert.ok(original);assert.equal(original.start,e.start);assert.equal(original.title.slice(0,200),e.title);
        return {start:e.start,end:e.end,allDay:e.allDay,matchesPublicSource:true};
      });
      evidence.months.push({from,to,status:r.status,rawCount:raw.length,acceptedCount:events.length,samples});
    }catch(e){evidence.months.push({from,to,error:e.message});}
  }
}finally{await sim.close();}
const outputIndex=process.argv.indexOf('--output-dir');
if(outputIndex>=0&&!process.argv[outputIndex+1])throw Error('--output-dir requires a directory');
const out=outputIndex<0?new URL('../output/acceptance/2026-10-23-v2/',import.meta.url):pathToFileURL(resolve(process.argv[outputIndex+1])+'/');
mkdirSync(out,{recursive:true});
writeFileSync(new URL('calendar-public-probe.json',out),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
process.exitCode=evidence.months.every(month=>month.status===200&&!month.error)?0:1;
