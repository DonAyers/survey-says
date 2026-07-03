#!/usr/bin/env node
// scripts/kill-ports.mjs — frees up the given TCP ports by killing whatever
// process is listening on them. Safe to run when nothing is listening (it
// just logs and exits 0), so it's used as a "pre" hook for dev scripts to
// guarantee `npm run dev` / `npm run server` / `npm run dev-stack` always
// start clean instead of failing with EADDRINUSE.

import { execSync } from "node:child_process";

const ports = process.argv.slice(2);

if (ports.length === 0) {
  console.error("Usage: kill-ports.mjs <port> [port...]");
  process.exit(0);
}

for (const port of ports) {
  let pids = [];
  try {
    pids = execSync(`lsof -t -i:${port}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // lsof exits non-zero when nothing matches — that's fine, just means
    // the port is already free.
  }

  if (pids.length === 0) {
    console.log(`[kill-ports] port ${port}: nothing running`);
    continue;
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGKILL");
      console.log(`[kill-ports] port ${port}: killed pid ${pid}`);
    } catch {
      // Process may have already exited between lsof and kill — ignore.
    }
  }
}
