"use strict";
// Read the current game's log directly; no export or log inspection is needed from the player.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const logs = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData/Roaming"), "Minecraft Bedrock/logs");
const files = fs.existsSync(logs) ? fs.readdirSync(logs).filter(name => /^ContentLog.*\.txt$/.test(name)) : [];
files.sort((a, b) => fs.statSync(path.join(logs, b)).mtimeMs - fs.statSync(path.join(logs, a)).mtimeMs);
if (!files.length) {
  console.error("No Minecraft content logs in " + logs);
  process.exitCode = 1;
} else {
  const file = path.join(logs, files[0]);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/), output = [];
  let keep = false;
  for (const line of lines) {
    if (/^\d{2}:\d{2}:\d{2}\[/.test(line)) keep = /\[Ponder(?:\/BP\]| [a-z0-9]+:\d+\])/.test(line);
    if (keep && line.trim()) output.push(line);
  }
  console.log(file);
  console.log(output.length ? output.slice(-240).join("\n") : "No Ponder file-log entries in this session yet.");
}
