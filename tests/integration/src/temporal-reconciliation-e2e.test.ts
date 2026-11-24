import { afterAll, afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createDb } from "@helm/db";
import { actionReceipts, taskEvents, tasks, users } from "@helm/db";
import { eq } from "drizzle-orm";

const run = process.env.HELM_TEMPORAL_RECONCILIATION_E2E_TEST === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dbUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/helm";

async function getFreePort(): Promise<number> { return await new Promise((resolve,reject)=>{ const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{ const a=s.address(); if(!a||typeof a==="string"){s.close(()=>reject(new Error("no port"))); return;} const {port}=a; s.close(err=>err?reject(err):resolve(port));}); s.on("error",reject);}); }
async function waitForHttp(url: string, timeoutMs=60000){ const start=Date.now(); while(Date.now()-start<timeoutMs){ try{ const r=await fetch(url); if(r.ok||r.status<500) return; }catch{} await delay(250);} throw new Error(`Timed out ${url}`); }
function spawnPnpm(cwd: string, env: Record<string,string>) { const cmd = process.platform==="win32"?"cmd.exe":"pnpm"; const args=process.platform==="win32"?["/d","/s","/c","pnpm","exec","tsx","src/index.ts"]: ["exec","tsx","src/index.ts"]; const child=spawn(cmd,args,{cwd,env:{...process.env,...env},stdio:"pipe"}); child.stdout.on("data",()=>{}); child.stderr.on("data",()=>{}); return child; }
async function stopChild(child: ChildProcessWithoutNullStreams|null){ if(!child?.pid) return; if(process.platform==="win32") await new Promise<void>(resolve=>{ const k=spawn("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"}); k.on("exit",()=>resolve()); k.on("error",()=>resolve()); }); else { try{child.kill("SIGTERM");}catch{} } await delay(300); }
async function api(base:string,p:string,init?:RequestInit,userId="usr_local_dev"){ const res=await fetch(`${base}${p}`,{...init,headers:{"content-type":"application/json","x-user-id":userId,...(init?.headers??{})}}); const text=await res.text(); let json:any=null; try{json=JSON.parse(text);}catch{} return {status:res.status,json,text}; }
const uid=(p:string)=>`${p}_${crypto.randomUUID().replace(/-/g,"")}`;

(run?describe:describe.skip)("Temporal reconciliation schedule/fault injection (env-gated)", ()=>{
  let apiChild: ChildProcessWithoutNullStreams|null=null;
  let mockChild: ChildProcessWithoutNullStreams|null=null;
  let conn: ReturnType<typeof createDb>|undefined;
  afterEach(async()=>{ await stopChild(apiChild); apiChild=null; await stopChild(mockChild); mockChild=null; });
  afterAll(async()=>{ await stopChild(apiChild); await stopChild(mockChild); if(conn) await conn.pool.end(); });

  it("reconciles uncertain receipt via Temporal schedule tick and preserves no-blind-retry on lookup fault", async()=>{
    conn=createDb(dbUrl); const db=conn.db;
    await db.insert(users).values({id:"usr_local_dev",email:"dev@local",name:"Dev"}).onConflictDoNothing();

    const mockPort=await getFreePort();
    const mockBase=`http://127.0.0.1:${mockPort}`;
    const idem=uid("idem");
    const mockCode=[
      "const http=require('node:http');",
      "http.createServer((req,res)=>{",
      " const u=req.url||'';",
      " if(u.startsWith('/gmail/v1/users/me/messages?')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({messages:[{id:'msg_sched_t',threadId:'thr_t'}]}));return;}",
      " if(u.startsWith('/gmail/v1/users/me/messages/msg_sched_t')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'msg_sched_t',threadId:'thr_t',payload:{headers:[{name:'X-Helm-Idempotency',value:process.env.EXPECT_IDEM},{name:'Subject',value:'hi'},{name:'To',value:'a@b.com'}]}}));return;}",
      " res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'not found'}}));",
      `}).listen(${mockPort},'127.0.0.1');`,
    ].join("");
    mockChild=spawn(process.execPath,["-e",mockCode],{env:{...process.env,EXPECT_IDEM:idem},stdio:"pipe"}) as ChildProcessWithoutNullStreams;
    mockChild.stdout.on("data",()=>{}); mockChild.stderr.on("data",()=>{});
    await delay(300);

    const apiPort=await getFreePort();
    const apiBase=`http://127.0.0.1:${apiPort}`;
    apiChild=spawnPnpm(path.join(repoRoot,"backend/api"),{
      PORT:String(apiPort), DATABASE_URL:dbUrl,
      HELM_REQUIRE_AUTH:"0", HELM_ALLOW_DEV_AUTH:"1",
      HELM_GMAIL_API_BASE:mockBase, HELM_TEST_CONNECTOR_HTTP:"1",
      HELM_RECONCILIATION_ENABLED:"1", HELM_RECONCILIATION_INTERVAL_MS:"10000", HELM_RECONCILIATION_OLDER_THAN_MS:"0", HELM_RECONCILIATION_LIMIT:"10",
      HELM_TEMPORAL_ENABLED:"1", HELM_TEMPORAL_MODE:"external-write", HELM_TEMPORAL_TEST_MODE:"stub",
      HELM_TEMPORAL_RECONCILIATION_SCHEDULE_ENABLED:"1",
      VAULT_MASTER_KEY:"test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${apiBase}/health`,60000);

    const taskId=uid("tsk"); const receiptId=uid("rcpt"); const now=new Date(Date.now()-120000);
    await db.insert(tasks).values({id:taskId,userId:"usr_local_dev",title:"r",prompt:"r",kind:"connector",status:"failed",priority:0,createdAt:now,updatedAt:now}).onConflictDoNothing();
    await db.insert(actionReceipts).values({id:receiptId,userId:"usr_local_dev",taskId,actionKind:"gmail.send",actionHash:"ah",idempotencyKey:idem,status:"uncertain",evidence:{accountId:"cac_test",subject:"hi",to:["a@b.com"]},createdAt:now}).onConflictDoNothing();

    // ensure schedule status endpoint is readable in stub mode
    const st=await api(apiBase,"/v1/reconciliation/status");
    expect(st.status).toBe(200);
    expect(st.json?.temporalSchedule?.scheduleId).toBeTruthy();

    const deadline=Date.now()+30000;
    let status="uncertain";
    while(Date.now()<deadline){
      const [row]=await db.select().from(actionReceipts).where(eq(actionReceipts.id,receiptId)).limit(1);
      status=row?.status ?? status;
      if(status==="executed") break;
      await delay(1000);
    }
    expect(status).toBe("executed");

    // fault injection: lookup error must not auto-fail uncertain receipt and must not blind-retry
    await stopChild(apiChild); apiChild=null;
    const faultPort=await getFreePort();
    const faultBase=`http://127.0.0.1:${faultPort}`;
    apiChild=spawnPnpm(path.join(repoRoot,"backend/api"),{
      PORT:String(faultPort), DATABASE_URL:dbUrl,
      HELM_REQUIRE_AUTH:"0", HELM_ALLOW_DEV_AUTH:"1",
      HELM_GMAIL_API_BASE:mockBase, HELM_TEST_CONNECTOR_HTTP:"1",
      HELM_RECONCILIATION_ENABLED:"0",
      HELM_RECONCILIATION_FAULT_INJECT:"lookup_error",
      VAULT_MASTER_KEY:"test-vault-master-key-32-bytes-minimum-padding",
    });
    await waitForHttp(`${faultBase}/health`,60000);
    const receipt2=uid("rcpt"); const idem2=uid("idem");
    await db.insert(actionReceipts).values({id:receipt2,userId:"usr_local_dev",taskId,actionKind:"gmail.send",actionHash:"ah2",idempotencyKey:idem2,status:"uncertain",evidence:{accountId:"cac_test",subject:"hi2",to:["a@b.com"]},createdAt:new Date(Date.now()-120000)}).onConflictDoNothing();
    const before=await db.select().from(actionReceipts).where(eq(actionReceipts.id,receipt2)).limit(1);
    const r=await api(faultBase,"/v1/reconciliation/run",{method:"POST",body:JSON.stringify({olderThanMs:0,limit:10})});
    expect(r.status).toBe(200);
    expect(r.json?.failed).toBeGreaterThanOrEqual(1);
    const [after]=await db.select().from(actionReceipts).where(eq(actionReceipts.id,receipt2)).limit(1);
    expect(after?.status).toBe("uncertain");
    expect(after?.externalRef ?? null).toBe(before[0]?.externalRef ?? null);

    await db.delete(actionReceipts).where(eq(actionReceipts.id,receiptId));
    await db.delete(actionReceipts).where(eq(actionReceipts.id,receipt2));
    await db.delete(taskEvents).where(eq(taskEvents.taskId,taskId));
    await db.delete(tasks).where(eq(tasks.id,taskId));
  }, 150000);
});
