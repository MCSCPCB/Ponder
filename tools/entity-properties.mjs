import assert from "node:assert/strict";

// Ponder properties deliberately use constant defaults, never Molang strings.
function checkConstants(property, label) {
  assert(property && typeof property === "object" && !Array.isArray(property), `${label}: expected a property object`);
  const { type, default: value, range } = property;
  assert(["int", "float", "bool"].includes(type), `${label}: unsupported property type ${type}`);
  if (type === "bool") {
    assert.equal(typeof value, "boolean", `${label}.default: expected a bool constant`);
    assert.equal(range, undefined, `${label}: bool properties must not have a numeric range`);
    return;
  }
  const checkNumber = (number, location) => {
    assert(typeof number === "number" && Number.isFinite(number), `${location}: expected a finite ${type} constant`);
    if (type === "int")
      assert(Number.isInteger(number) && number >= -2147483648 && number <= 2147483647,
        `${location}: expected a signed 32-bit int constant`);
  };
  checkNumber(value, `${label}.default`);
  assert(Array.isArray(range) && range.length === 2, `${label}.range: expected two numeric constants`);
  range.forEach((number, index) => checkNumber(number, `${label}.range[${index}]`));
  assert(range[0] <= range[1], `${label}.range: minimum exceeds maximum`);
  assert(value >= range[0] && value <= range[1], `${label}.default: outside the declared range`);
}

function floatConstant(value) {
  // Writing 1.0 in JavaScript is not enough: JSON.stringify would still emit 1.
  // Preserve a fractional part even for zero, whole numbers and exponent forms.
  const [mantissa, exponent] = (Object.is(value, -0) ? "-0" : String(value)).split("e");
  return JSON.rawJSON(`${mantissa.includes(".") ? mantissa : `${mantissa}.0`}${exponent === undefined ? "" : `e${exponent}`}`);
}

export function entityProperty(type, value, range) {
  const property = { type, default: value, ...(range === undefined ? {} : { range }), client_sync: true };
  checkConstants(property, "Entity property");
  if (type === "float") {
    property.default = floatConstant(value);
    property.range = range.map(floatConstant);
  }
  return property;
}

/** Validate original JSON tokens; parsing numbers alone loses int/float spelling. */
export function checkEntityPropertyLiterals(text, label = "Entity JSON") {
  const sources = new WeakMap();
  const data = JSON.parse(text, function (key, value, context) {
    if (context.source !== undefined) {
      if (!sources.has(this)) sources.set(this, new Map());
      sources.get(this).set(key, context.source);
    }
    return value;
  });
  const properties = data?.["minecraft:entity"]?.description?.properties;
  assert(properties && typeof properties === "object" && !Array.isArray(properties),
    `${label}: missing entity properties`);
  for (const [name, property] of Object.entries(properties)) {
    const location = `${label}: ${name}`;
    checkConstants(property, location);
    if (property.type === "bool") continue;
    const checkToken = (holder, key, field) => {
      const token = sources.get(holder)?.get(key);
      assert(typeof token === "string", `${location}.${field}: missing JSON source token`);
      if (property.type === "float")
        assert(/[.eE]/.test(token), `${location}.${field}: float constant must use a floating-point JSON literal, got ${token}`);
      else
        assert(/^-?(?:0|[1-9]\d*)$/.test(token), `${location}.${field}: int constant must use an integer JSON literal, got ${token}`);
    };
    checkToken(property, "default", "default");
    property.range.forEach((_, index) => checkToken(property.range, String(index), `range[${index}]`));
  }
  return data;
}
