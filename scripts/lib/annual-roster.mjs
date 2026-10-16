import { createHash } from "node:crypto";

export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const levels = ["md", "district", "region", "zone", "club"];
export class RosterImportError extends Error {}
const fail = message => { throw new RosterImportError(message); };
const text = (value, field, max = 200) => typeof value === "string" && value.trim() && value.length <= max ? value.trim() : fail(`Invalid ${field}`);
const keys = (items, field) => {
  const values = items.map(item => text(item[field], field));
  if (new Set(values).size !== values.length) fail(`Duplicate ${field}`);
  return values;
};

/** No DB or account access. Uses explicit source-key-to-ID mapping, never names. */
export function validateApprovedRoster(input) {
  if (input?.schema !== "lionclub-approved-roster-v1") fail("An approved roster v1 is required, not a candidate workbook snapshot");
  text(input.batchId, "batchId");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.batchId)) fail("Invalid batch ID");
  if (!Number.isInteger(input.yearStart) || input.yearStart < 1900 || input.yearStart > 2200) fail("Invalid yearStart");
  text(input.approval?.approvedBy, "approvedBy");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.approval?.approvedAt ?? "") || !Number.isFinite(Date.parse(input.approval.approvedAt))) fail("Approval timestamp must be explicit ISO date-time with timezone");
  text(input.approval?.evidence, "approval evidence", 500);
  if (!Array.isArray(input.organizations) || !input.organizations.length || input.organizations.length > 1000) fail("Invalid organizations");
  if (!Array.isArray(input.appointments) || !input.appointments.length || input.appointments.length > 10000) fail("Invalid appointments");
  keys(input.organizations, "key"); keys(input.appointments, "key");
  const byKey = new Map(input.organizations.map(org => [org.key, org]));
  for (const org of input.organizations) {
    text(org.name, "organization name");
    const index = levels.indexOf(org.level);
    if (index < 0) fail(`Invalid organization level ${org.key}`);
    if (index === 0) { if (org.parentKey !== null) fail(`Root needs null parent ${org.key}`); }
    else if (byKey.get(org.parentKey)?.level !== levels[index - 1]) fail(`Missing direct parent ${org.key}`);
  }
  for (const row of input.appointments) {
    if (!byKey.has(row.organizationKey)) fail(`Unknown appointment organization ${row.key}`);
    text(row.personName, "personName");text(row.positionName, "positionName");text(row.sourcePage, "sourcePage", 40);
    if (!["現任職務", "歷任列載", "榮譽列載"].includes(row.listingNature)) fail(`Invalid listing nature ${row.key}`);
    if (row.homeClubSourceName !== null) text(row.homeClubSourceName, "homeClubSourceName");
    // Deliberately no identity-link/grant fields in this input contract.
    for (const field of ["memberId", "userId", "email", "phone", "adminRole", "roles", "memberIdOverride"]) {
      if (Object.hasOwn(row, field)) fail(`Forbidden account/contact field ${field}`);
    }
  }
  return input;
}

export function rosterDataDigest(input, mapping) {
  validateApprovedRoster(input);
  return digest({ input, mapping });
}

export function prepareRosterImport(input, mapping, snapshot) {
  validateApprovedRoster(input);
  if (!Array.isArray(mapping?.organizations) || mapping.organizations.length !== input.organizations.length || !Array.isArray(snapshot)) fail("Complete mapping and DB organization snapshot required");
  keys(mapping.organizations, "sourceKey");keys(mapping.organizations, "targetId");
  const maps = new Map(mapping.organizations.map(row => [row.sourceKey, row]));
  const current = new Map(snapshot.map(row => [row.id, row]));
  const byKey = new Map(input.organizations.map(row => [row.key, row]));
  for(const m of mapping.organizations) if(!byKey.has(m.sourceKey))fail(`Unknown mapping key ${m.sourceKey}`);
  const operations = [];
  const baseline = [];
  // Source data may be sorted differently; level order guarantees parents first.
  const sorted = [...input.organizations].sort((a,b) => levels.indexOf(a.level)-levels.indexOf(b.level) || a.key.localeCompare(b.key));
  for (const org of sorted) {
    const m = maps.get(org.key);
    text(m.targetId, "targetId"); text(m.name, "explicit target name");
    const existing = current.get(m.targetId);
    // The source starts at a multiple district. Preserve an existing international parent.
    const parentId = org.level === "md" && m.action === "existing" && existing ? existing.parentId : org.parentKey === null ? null : maps.get(org.parentKey)?.targetId;
    if (m.action === "create") {
      if (existing) fail(`Create target already exists ${org.key}`);
      baseline.push({id:m.targetId, exists:false});
      operations.push({action:"create",sourceKey:org.key,data:{id:m.targetId,level:org.level,name:m.name,parentId,districtCode:org.level === "md" ? null : "300A-1",isActive:true,sourceLabel:`核定年度名冊 ${input.yearStart}-${input.yearStart+1} / p.${org.sourcePage}`,verifiedAt:new Date(input.approval.approvedAt)}});
    } else if (m.action === "existing") {
      if (!Object.hasOwn(m,"expectedParentId")) fail(`Expected parent required ${org.key}`);
      if (!existing || existing.level !== org.level || existing.name !== m.name || existing.parentId !== m.expectedParentId || existing.isActive !== true) fail(`Stale or mismatched organization mapping ${org.key}`);
      if (org.level !== "md" && existing.districtCode !== "300A-1") fail(`Cross-district organization ${org.key}`);
      baseline.push({id:existing.id,level:existing.level,name:existing.name,parentId:existing.parentId,isActive:existing.isActive,districtCode:existing.districtCode});
      if (existing.parentId !== parentId) operations.push({action:"reparent",sourceKey:org.key,id:existing.id,beforeParentId:existing.parentId,parentId});
    } else fail(`Explicit create/existing action required ${org.key}`);
  }
  // Reject an unintended merge of the two similarly named clubs at the mapping level.
  if (new Set(mapping.organizations.map(m=>m.targetId)).size !== mapping.organizations.length) fail("Many-to-one organization mapping forbidden");
  const finalGraph=new Map(snapshot.map(row=>[row.id,{...row}]));
  for(const operation of operations){
    if(operation.action==='create')finalGraph.set(operation.data.id,operation.data);
    else finalGraph.get(operation.id).parentId=operation.parentId;
  }
  // Validate the resulting graph, including a preserved international ancestor.
  // Merely checking the input tree would miss cycles introduced through existing data.
  const parents={club:'zone',zone:'region',region:'district',district:'md',md:'international'};
  const ancestors=new Set();
  for(const m of mapping.organizations){
    let node=finalGraph.get(m.targetId);const visited=new Set();
    while(node){
      if(visited.has(node.id)||visited.size>32)fail('Final organization hierarchy contains a cycle');
      visited.add(node.id);ancestors.add(node.id);
      if(node.isActive!==true)fail('Final hierarchy has an inactive ancestor');
      if(node.parentId===null){if(!['md','international'].includes(node.level))fail('Final hierarchy has a missing parent');break;}
      const parent=finalGraph.get(node.parentId);
      if(!parent||parents[node.level]!==parent.level)fail('Final hierarchy needs its exact direct ancestor in snapshot');
      node=parent;
    }
  }
  const ancestorBaseline=[...ancestors].sort().map(id=>current.has(id)?current.get(id):{id,exists:false});
  const sourceDigest = rosterDataDigest(input,mapping);
  const planDigest = digest({sourceDigest,baseline,ancestorBaseline,operations});
  const appointments = input.appointments.map(row=>({
    id:`${input.batchId}:${row.key}`,batchId:input.batchId,sourceKey:row.key,yearStart:input.yearStart,
    organizationId:maps.get(row.organizationKey).targetId,positionName:row.positionName,personName:row.personName,
    homeClubSourceName:row.homeClubSourceName,listingNature:row.listingNature,sourcePage:row.sourcePage,
    approvedBy:input.approval.approvedBy,approvedAt:new Date(input.approval.approvedAt),
  }));
  return {sourceDigest,planDigest,operations,appointments,summary:{batchId:input.batchId,sourceDigest,planDigest,organizations:input.organizations.length,createOrganizations:operations.filter(o=>o.action==="create").length,reparentOrganizations:operations.filter(o=>o.action==="reparent").length,appointments:appointments.length,omittedUnnamedSlots:input.omissions?.length ?? 0,accountWrites:0,roleGrants:0}};
}

/** Read mapped nodes plus their stored ancestors. No member/contact queries. */
export async function readRosterOrganizationSnapshot(db,mapping){
  const rows=new Map(),seen=new Set();
  let frontier=[...new Set(mapping.organizations.map(m=>m.targetId))];
  for(let depth=0;frontier.length;depth++){
    if(depth>32)fail('Existing hierarchy exceeds safe depth');
    const ids=frontier.filter(id=>!seen.has(id));if(!ids.length)break;
    ids.forEach(id=>seen.add(id));
    const found=await db.organization.findMany({where:{id:{in:ids}},select:{id:true,level:true,name:true,parentId:true,isActive:true,districtCode:true}});
    for(const org of found)rows.set(org.id,org);
    frontier=found.map(org=>org.parentId).filter(id=>id&&!seen.has(id));
  }
  return [...rows.values()].sort((a,b)=>a.id.localeCompare(b.id));
}

/** Explicit apply only. Entire batch is atomic; no Member/User/AdminRole writes. */
export async function applyRosterImport(prisma, input, mapping, confirmedPlanDigest) {
  const sourceDigest = rosterDataDigest(input,mapping);
  return prisma.$transaction(async tx => {
    const previous = await tx.rosterImportBatch.findUnique({where:{id:input.batchId}});
    if (previous) {
      if (previous.sourceDigest !== sourceDigest) fail("Batch ID already used with different data; do not overwrite history");
      return {alreadyApplied:true,batchId:previous.id,appointments:previous.appointmentCount};
    }
    const snapshot = await readRosterOrganizationSnapshot(tx,mapping);
    const plan = prepareRosterImport(input,mapping,snapshot);
    if (plan.planDigest !== confirmedPlanDigest) fail("Plan changed since review. Run a fresh preview; no writes applied");
    for (const operation of plan.operations) {
      if (operation.action === "create") await tx.organization.create({data:operation.data});
      else {
        const updated = await tx.organization.updateMany({where:{id:operation.id,parentId:operation.beforeParentId,isActive:true},data:{parentId:operation.parentId}});
        if (updated.count !== 1) fail("Organization changed during import");
      }
    }
    await tx.rosterImportBatch.create({data:{id:input.batchId,sourceDigest:plan.sourceDigest,yearStart:input.yearStart,approvedBy:input.approval.approvedBy,approvedAt:new Date(input.approval.approvedAt),organizationCount:input.organizations.length,appointmentCount:plan.appointments.length}});
    await tx.annualAppointment.createMany({data:plan.appointments});
    return {alreadyApplied:false,...plan.summary};
  },{isolationLevel:"Serializable",maxWait:10000,timeout:60000});
}
