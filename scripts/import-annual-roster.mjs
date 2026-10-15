#!/usr/bin/env node
// Operator-only CLI. Default is offline preview. Never loads .env or application secrets.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {dirname} from "node:path";
import { prepareRosterImport, applyRosterImport, readRosterOrganizationSnapshot, RosterImportError } from "./lib/annual-roster.mjs";

const args=process.argv.slice(2),values={};
const flags=new Set(["--apply","--inspect-db","--export-organizations","--help"]);
const options=new Set(["--input","--mapping","--snapshot","--confirm-plan","--confirm-database","--output"]);
for(let i=0;i<args.length;i++){
 const key=args[i];
 if(flags.has(key)){if(values[key])throw Error("Duplicate flag");values[key]=true;}
 else if(options.has(key)&&args[i+1]&&!args[i+1].startsWith("--")){if(values[key])throw Error("Duplicate option");values[key]=args[++i];}
 else throw Error("Unknown/missing option; use --help");
}
if(values["--help"]){
 console.log("Offline preview: node scripts/import-annual-roster.mjs --input /private/approved.json --mapping /private/mapping.json --snapshot /private/organizations.json");
 console.log("Read-only DB preview: same --input/--mapping with --inspect-db instead of --snapshot.");
 console.log("Read-only mapping snapshot: --export-organizations --output /private/organizations.private.json (requires ROSTER_DATABASE_URL).");
 console.log("Apply: --apply --confirm-plan <preview-sha256> --confirm-database <operator-label>. Requires explicit ROSTER_DATABASE_URL and matching ROSTER_DATABASE_LABEL; never uses ambient DATABASE_URL.");
 process.exit(0);
}
const json=async file=>{if(!file)throw new RosterImportError("Required file option missing");return JSON.parse(await readFile(file,"utf8"));};
let prisma;
try{
 if(values["--export-organizations"]){
  if(values["--apply"]||values["--inspect-db"]||values["--input"]||values["--mapping"]||values["--snapshot"])throw new RosterImportError("Export is a separate read-only mode");
  if(!values["--output"]?.endsWith(".private.json")||!process.env.ROSTER_DATABASE_URL)throw new RosterImportError("Private JSON output and explicit ROSTER_DATABASE_URL required");
  const {PrismaClient}=await import("@prisma/client");
  prisma=new PrismaClient({datasources:{db:{url:process.env.ROSTER_DATABASE_URL}}});
  const roots=await prisma.organization.findMany({where:{OR:[{districtCode:"300A-1"},{level:"md",code:{in:["300A","MD300A"]}}]},select:{id:true},orderBy:{id:"asc"},take:2001});
  if(roots.length>2000)throw new RosterImportError("Snapshot exceeds expected scope; review database selection");
  const snapshot=await readRosterOrganizationSnapshot(prisma,{organizations:roots.map(row=>({targetId:row.id}))});
  await mkdir(dirname(values["--output"]),{recursive:true,mode:0o700});
  await writeFile(values["--output"],JSON.stringify(snapshot,null,2)+"\n",{mode:0o600,flag:"wx"});
  console.log(JSON.stringify({mode:"read-only-export",organizations:snapshot.length,databaseWrites:0}));
 }else{
 const input=await json(values["--input"]),mapping=await json(values["--mapping"]);
 if(values["--apply"]||values["--inspect-db"]){
  if(values["--snapshot"])throw new RosterImportError("Do not combine DB mode with an offline snapshot");
  if(!process.env.ROSTER_DATABASE_URL)throw new RosterImportError("Explicit ROSTER_DATABASE_URL required");
  if(values["--apply"]){
   if(!/^[a-f0-9]{64}$/.test(values["--confirm-plan"]??""))throw new RosterImportError("Reviewed plan digest required");
   if(!values["--confirm-database"]||values["--confirm-database"]!==process.env.ROSTER_DATABASE_LABEL)throw new RosterImportError("Explicit database label confirmation required");
  }
  const {PrismaClient}=await import("@prisma/client");
  prisma=new PrismaClient({datasources:{db:{url:process.env.ROSTER_DATABASE_URL}}});
  if(values["--apply"])console.log(JSON.stringify(await applyRosterImport(prisma,input,mapping,values["--confirm-plan"]),null,2));
  else {
   const snapshot=await readRosterOrganizationSnapshot(prisma,mapping);
   console.log(JSON.stringify({mode:"read-only-preview",...prepareRosterImport(input,mapping,snapshot).summary},null,2));
  }
 }else console.log(JSON.stringify({mode:"offline-preview",...prepareRosterImport(input,mapping,await json(values["--snapshot"])).summary},null,2));
 }
}catch(error){
 // Do not leak private names, URLs or provider error details to CI logs.
 console.error(error instanceof RosterImportError ? error.message : "Import failed. Check private input format, explicit DB configuration and migration state; provider/input details are not logged.");
 process.exitCode=1;
}finally{await prisma?.$disconnect();}
