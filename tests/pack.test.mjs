import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { buildAddon } from "../tools/pack.mjs";
import { checkEntityPropertyLiterals } from "../tools/entity-properties.mjs";

const first = buildAddon();
test("the distributable contains exactly two root-level installable packs with matching manifests", () => {
  const archive = unzipSync(first.addon);
  assert.deepEqual(Object.keys(archive).sort(), ["Ponder-BP.mcpack", "Ponder-RP.mcpack"]);
  const packs = Object.fromEntries(Object.entries(archive).map(([name, bytes]) => [name, unzipSync(bytes)]));
  const bp = JSON.parse(strFromU8(packs["Ponder-BP.mcpack"]["manifest.json"]));
  const rp = JSON.parse(strFromU8(packs["Ponder-RP.mcpack"]["manifest.json"]));
  assert.deepEqual(bp.header.version, rp.header.version);
  assert.equal(first.filename, `Ponder-${bp.header.version.join(".")}.mcaddon`);
  for (const [manifest, other] of [[bp, rp], [rp, bp]])
    assert.deepEqual(manifest.dependencies.find(dep => dep.uuid === other.header.uuid).version, other.header.version);
  assert(packs["Ponder-BP.mcpack"][bp.modules.find(module => module.type === "script").entry]);
  assert(packs["Ponder-RP.mcpack"]["licenses/Ponder-MIT.txt"]);
  assert(packs["Ponder-RP.mcpack"]["ui/ponder.generated.json"]);
  for (const files of Object.values(packs)) for (const name of Object.keys(files)) {
    assert(!/(^|\/)(?:node_modules|_sample|\.cache|\.codex|\.git|tests|tools)(\/|$)/.test(name), name);
    assert(!name.startsWith("/") && !name.includes("\\") && !name.split("/").includes(".."), name);
    assert(!/ponder_block|\.jsonc$/.test(name), name);
  }
});
test("packaging is byte-reproducible without changing source content", () => {
  assert.deepEqual(buildAddon().addon, first.addon);
});
test("packaged behavior entities retain numeric float literals and constant property types", () => {
  const bp = unzipSync(unzipSync(first.addon)["Ponder-BP.mcpack"]);
  for (const kind of ["text", "frame", "line", "icon"]) {
    const filename = `entities/ponder_${kind}.json`;
    checkEntityPropertyLiterals(strFromU8(bp[filename]), `Ponder-BP.mcpack/${filename}`);
  }
});
test("the delivery hash describes the exact archive bytes", () => {
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.sha256, createHash("sha256").update(first.addon).digest("hex"));
});
