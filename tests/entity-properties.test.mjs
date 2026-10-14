import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { entityProperty, checkEntityPropertyLiterals } from "../tools/entity-properties.mjs";
import { path } from "../tools/files.mjs";

const entity = property => `{"minecraft:entity":{"description":{"properties":{"ponder:test":${property}}}}}`;

test("entity property generation preserves float, int and bool literal constants", () => {
  assert.equal(JSON.stringify(entityProperty("float", 1, [0, 1])),
    '{"type":"float","default":1.0,"range":[0.0,1.0],"client_sync":true}');
  assert.equal(JSON.stringify(entityProperty("int", -1, [-1, 16777215])),
    '{"type":"int","default":-1,"range":[-1,16777215],"client_sync":true}');
  assert.equal(JSON.stringify(entityProperty("bool", true)),
    '{"type":"bool","default":true,"client_sync":true}');
});

test("float serialization keeps zero signs, fractions and exponent forms as numeric literals", () => {
  for (const [value, literal] of [[0, "0.0"], [-0, "-0.0"], [-1, "-1.0"], [.055, "0.055"],
    [65535, "65535.0"], [1e-7, "1.0e-7"], [1e21, "1.0e+21"]]) {
    const text = JSON.stringify(entityProperty("float", value, [-1e22, 1e22]));
    assert.equal(text.match(/"default":([^,]+)/)[1], literal);
    const property = checkEntityPropertyLiterals(entity(text))["minecraft:entity"].description.properties["ponder:test"];
    assert(Object.is(property.default, value));
  }
});

test("property generation rejects expressions and coercion instead of disguising them as constants", () => {
  for (const value of ["1.0", "return 1.0;", "q.variant", null, true, NaN, Infinity])
    assert.throws(() => entityProperty("float", value, [0, 1]), /finite float constant/);
  assert.throws(() => entityProperty("float", 1, ["0.0", 1]), /finite float constant/);
  assert.throws(() => entityProperty("int", .5, [0, 1]), /int constant/);
  assert.throws(() => entityProperty("int", 2147483648, [0, 2147483648]), /int constant/);
  assert.throws(() => entityProperty("bool", "true"), /bool constant/);
  assert.throws(() => entityProperty("bool", 1), /bool constant/);
  assert.throws(() => entityProperty("float", 2, [0, 1]), /outside the declared range/);
});

test("raw entity validation rejects integer tokens in float defaults and either range bound", () => {
  for (const property of [
    '{"type":"float","default":1,"range":[0.0,1.0]}',
    '{"type":"float","default":1.0,"range":[0,1.0]}',
    '{"type":"float","default":1.0,"range":[0.0,1]}',
  ]) assert.throws(() => checkEntityPropertyLiterals(entity(property)), /floating-point JSON literal/);
  assert.doesNotThrow(() => checkEntityPropertyLiterals(entity('{"type":"float","default":1.0,"range":[0.0,1.0]}')));
});

test("raw entity validation rejects floating-point int tokens and quoted constant defaults", () => {
  for (const property of [
    '{"type":"int","default":1.0,"range":[0,1]}',
    '{"type":"int","default":1e0,"range":[0,1]}',
    '{"type":"int","default":1,"range":[0.0,1]}',
    '{"type":"int","default":1,"range":[0,1.0]}',
  ]) assert.throws(() => checkEntityPropertyLiterals(entity(property)), /integer JSON literal/);
  for (const property of [
    '{"type":"float","default":"1.0","range":[0.0,1.0]}',
    '{"type":"int","default":"1","range":[0,1]}',
    '{"type":"bool","default":"true"}',
  ]) assert.throws(() => checkEntityPropertyLiterals(entity(property)), /constant/);
});

test("ordinary parse/stringify round-tripping cannot silently erase entity float types", () => {
  const source = entity(JSON.stringify(entityProperty("float", 1, [0, 1])));
  assert.doesNotThrow(() => checkEntityPropertyLiterals(source));
  assert.throws(() => checkEntityPropertyLiterals(JSON.stringify(JSON.parse(source))), /floating-point JSON literal/);
});

test("all four generated annotations have type-correct constant defaults and ranges", () => {
  const counts = { float: 0, int: 0, bool: 0 };
  for (const kind of ["text", "frame", "line", "icon"]) {
    const filename = `src/BP/entities/ponder_${kind}.json`;
    const data = checkEntityPropertyLiterals(readFileSync(path(filename), "utf8"), filename);
    for (const property of Object.values(data["minecraft:entity"].description.properties)) counts[property.type]++;
  }
  assert.deepEqual(counts, { float: 21, int: 13, bool: 4 });
});
