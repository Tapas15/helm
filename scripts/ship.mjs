#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const get = (k, d="") => { const i = args.indexOf(k); return i>=0 ? (args[i+1] ?? d) : d; };
const has = (k) => args.includes(k);
if (has("--help") || !get("--msg")) {
  console.log(`Usage: node scripts/ship.mjs --msg "commit message" [--body "details"] [--skip-gates] [--no-push]\n\nRuns gates (lint,typecheck), commits staged/changed tracked files except backups/.env, pushes, polls GitHub Actions for HEAD, then updates CURRENT_STATE.md and README.md CI links and pushes docs.`);
  process.exit(has("--help")?0:1);
}
const msg = get("--msg"); const body = get("--body");
const repo = process.cwd();
const sh = (cmd, cmdArgs, opts={}) => execFileSync(cmd, cmdArgs, { cwd: repo, encoding: "utf8", stdio: opts.quiet?["ignore","pipe","pipe"]: "inherit", ...opts });
const shq = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: repo, encoding: "utf8", stdio: ["ignore","pipe","pipe"] }).trim();
if (!has("--skip-gates")) {
  sh("pnpm", ["lint"]);
  sh("pnpm", ["typecheck"]);
}
const status = shq("git", ["status","--short"]);
if (!status) { console.log("No changes to commit."); process.exit(0); }
// Stage all tracked changes; keep untracked backups/.env out.
sh("git", ["add", "-u"]);
const staged = shq("git", ["diff","--cached","--name-only"]);
if (!staged) { console.log("No staged tracked changes."); process.exit(0); }
const commitArgs = ["commit","-m",msg]; if (body) commitArgs.push("-m",body);
sh("git", commitArgs);
if (has("--no-push")) process.exit(0);
sh("git", ["push","origin","main"]);
const head = shq("git", ["rev-parse","--short","HEAD"]);
const full = shq("git", ["rev-parse","HEAD"]);
let run = null;
for (let i=0;i<30;i++) {
  try {
    const runs = JSON.parse(shq("gh", ["run","list","--repo","Tapas15/helm","--branch","main","--limit","5","--json","databaseId,headSha,status,conclusion,url,displayTitle"]));
    run = runs.find(r => r.headSha === full);
    if (run && run.status === "completed") break;
  } catch {}
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15000);
}
if (!run) { console.log("Pushed; CI run not found yet for", head); process.exit(0); }
console.log("CI", run.conclusion, run.url);
if (run.conclusion !== "success") process.exit(2);
const id = String(run.databaseId);
for (const file of ["changes/CURRENT_STATE.md","README.md"]) {
  if (!fs.existsSync(file)) continue;
  let c = fs.readFileSync(file,"utf8");
  c = c.replace(/\*\*CI:\*\* green \[.*?\]\(https:\/\/github\.com\/Tapas15\/helm\/actions\/runs\/\d+\) \(`[^`]+`, main\)/, `**CI:** green [${id}](${run.url}) (\`${head}\`, main)`);
  c = c.replace(/\*\*Last updated:\*\* .*/, `**Last updated:** ${new Date().toISOString()}  `);
  c = c.replace(/CI green \[\d+\]\(https:\/\/github\.com\/Tapas15\/helm\/actions\/runs\/\d+\) \(`[^`]+`\)/, `CI green [${id}](${run.url}) (\`${head}\`)`);
  fs.writeFileSync(file,c);
}
sh("git", ["add","changes/CURRENT_STATE.md","README.md"]);
const diff = shq("git", ["diff","--cached","--name-only"]);
if (diff) {
  sh("git", ["commit","-m","docs: update CI link to latest green run"]);
  sh("git", ["push","origin","main"]);
  console.log("Updated CI links for", head);
}
