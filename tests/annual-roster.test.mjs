import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {prepareRosterImport,applyRosterImport,validateApprovedRoster} from '../scripts/lib/annual-roster.mjs';
import {createSimulation} from './helpers/simulation.mjs';

const fixture=()=>({schema:'lionclub-approved-roster-v1',batchId:'synthetic-roster',yearStart:2026,approval:{approvedBy:'synthetic-operator',approvedAt:'2026-10-15T00:00:00Z',evidence:'synthetic test approval'},organizations:[
 {key:'md',level:'md',name:'合成複合區',parentKey:null,sourcePage:'1'},
 {key:'district',level:'district',name:'合成區',parentKey:'md',sourcePage:'1'},
 {key:'region',level:'region',name:'合成專區',parentKey:'district',sourcePage:'51'},
 {key:'zone',level:'zone',name:'合成分區',parentKey:'region',sourcePage:'51'},
 {key:'club',level:'club',name:'合成分會',parentKey:'zone',sourcePage:'51'},
],appointments:[{key:'position-1',organizationKey:'club',positionName:'會長',personName:'合成人員',homeClubSourceName:'合成分會',listingNature:'現任職務',sourcePage:'51'}],omissions:[{key:'blank',reason:'missing name'}]});
const mapping=input=>({organizations:input.organizations.map(o=>({sourceKey:o.key,targetId:`test-roster-${o.key}`,action:'create',name:o.name}))});

test('roster preview is deterministic, direct-parent validated and needs no email/account',()=>{
 const input=fixture(),m=mapping(input),plan=prepareRosterImport(input,m,[]);
 assert.equal(plan.appointments.length,1);assert.equal(plan.summary.omittedUnnamedSlots,1);
 assert.equal(plan.summary.accountWrites,0);assert.equal(plan.summary.roleGrants,0);
 assert.equal(plan.planDigest,prepareRosterImport(input,m,[]).planDigest);
 assert.deepEqual(plan.operations.map(o=>o.data.level),['md','district','region','zone','club']);
 const changed=structuredClone(input);changed.approval.approvedBy='different-reviewer';
 assert.notEqual(plan.planDigest,prepareRosterImport(changed,m,[]).planDigest);
 const unrelated=structuredClone(input);unrelated.organizations[4].parentKey='district';assert.throws(()=>prepareRosterImport(unrelated,m,[]),/direct parent/);
 for(const field of ['email','phone','memberId','userId','roles','adminRole']){const copy=structuredClone(input);copy.appointments[0][field]='forbidden';assert.throws(()=>validateApprovedRoster(copy),/Forbidden/);}
 const blank=structuredClone(input);blank.appointments[0].personName='';assert.throws(()=>validateApprovedRoster(blank),/personName/);
 const unapproved=structuredClone(input);unapproved.schema='a1-roster-review-v1';assert.throws(()=>validateApprovedRoster(unapproved),/approved/);
 const timezone=structuredClone(input);timezone.approval.approvedAt='2026-10-15T00:00:00';assert.throws(()=>validateApprovedRoster(timezone),/timezone/);
 const collision=structuredClone(m);collision.organizations[4].targetId=collision.organizations[3].targetId;assert.throws(()=>prepareRosterImport(input,collision,[]),/Duplicate/);
});

test('explicit existing mapping rejects wrong level/name/parent/district/inactive, preserves international parent',()=>{
 const input=fixture(),m=mapping(input);
 const first=m.organizations[0];first.action='existing';first.expectedParentId='international';
 const existing={id:first.targetId,name:first.name,level:'md',parentId:'international',isActive:true,districtCode:null};
 const root={id:'international',level:'international',name:'Synthetic international',parentId:null,isActive:true,districtCode:null};
 const plan=prepareRosterImport(input,m,[existing,root]);assert.equal(plan.operations.some(o=>o.action==='reparent'&&o.id===existing.id),false);
 assert.throws(()=>prepareRosterImport(input,m,[existing]),/ancestor/);
 assert.throws(()=>prepareRosterImport(input,m,[existing,{...root,parentId:existing.id}]),/ancestor|cycle/);
 assert.throws(()=>prepareRosterImport(input,m,[existing,{...root,level:'club'}]),/ancestor/);
 assert.throws(()=>prepareRosterImport(input,m,[existing,{...root,isActive:false}]),/inactive/);
 for(const patch of [{name:'other'},{level:'club'},{parentId:null},{isActive:false}])assert.throws(()=>prepareRosterImport(input,m,[{...existing,...patch}]),/mismatch/);
 const copy=structuredClone(m);copy.organizations[1]={...copy.organizations[1],action:'existing',expectedParentId:existing.id};
 assert.throws(()=>prepareRosterImport(input,copy,[existing,{id:copy.organizations[1].targetId,name:copy.organizations[1].name,level:'district',parentId:existing.id,isActive:true,districtCode:'300A-2'}]),/Cross-district/);
});

test('real SQL import is atomic/idempotent, rejects stale plans, and never writes accounts or roles', {timeout:180000},async()=>{
 const sim=await createSimulation();
 try{
  const input=fixture(),m=mapping(input),plan=prepareRosterImport(input,m,[]);
  await assert.rejects(applyRosterImport(sim.prisma,input,m,'0'.repeat(64)),/Plan changed/);
  assert.equal(await sim.prisma.organization.count(),0);assert.equal(await sim.prisma.rosterImportBatch.count(),0);
  const result=await applyRosterImport(sim.prisma,input,m,plan.planDigest);assert.equal(result.alreadyApplied,false);
  assert.equal(await sim.prisma.organization.count(),5);assert.equal(await sim.prisma.annualAppointment.count(),1);
  for(const model of [sim.prisma.user,sim.prisma.member,sim.prisma.adminRole,sim.prisma.memberExperience])assert.equal(await model.count(),0);
  assert.equal((await applyRosterImport(sim.prisma,input,m,plan.planDigest)).alreadyApplied,true);
  const changed=structuredClone(input);changed.appointments[0].personName='different';await assert.rejects(applyRosterImport(sim.prisma,changed,m,plan.planDigest),/already used/);
  // Duplicate key at DB insertion after org writes proves transaction rollback.
  const second=fixture();second.batchId='synthetic-rollback';const m2=mapping(second);for(const row of m2.organizations)row.targetId+='-second';
  const p2=prepareRosterImport(second,m2,[]);
  const proxy={$transaction:cb=>sim.prisma.$transaction(async tx=>cb({...tx,annualAppointment:{createMany:()=>{throw Error('synthetic insertion failure');}}}))};
  await assert.rejects(applyRosterImport(proxy,second,m2,p2.planDigest),/insertion failure/);
  assert.equal(await sim.prisma.organization.count(),5);assert.equal(await sim.prisma.rosterImportBatch.count(),1);
 }finally{await sim.close();}
});

test('public organization-only roster contains 12 regions, 24 zones, 93 clubs and no nominal appointments',()=>{
 const data=JSON.parse(readFileSync(new URL('../data/rosters/a1-2026-2027-organizations.json',import.meta.url),'utf8'));
 assert.equal(data.organizations.length,131);
 for(const [level,total] of [['region',12],['zone',24],['club',93]])assert.equal(data.organizations.filter(o=>o.level===level).length,total);
 const ai=data.organizations.find(o=>o.name==='AI臺科大'),taipei=data.organizations.find(o=>o.name==='台北科大');
 assert.notEqual(ai.key,taipei.key);assert.equal(ai.parentKey,'R05-Z09');assert.equal(taipei.parentKey,'R05-Z10');
 assert.equal(Object.hasOwn(data,'appointments'),false);
 assert.ok(data.organizations.every(o=>!Object.hasOwn(o,'personName')&&!Object.hasOwn(o,'phone')&&!Object.hasOwn(o,'email')));
});
