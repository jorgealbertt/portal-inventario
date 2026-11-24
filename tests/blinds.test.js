import test from "node:test";
import assert from "node:assert/strict";
import { BLIND_OPTIONS, createBlindProduct } from "../src/blinds.js";

const colorCodes = (family) => BLIND_OPTIONS.find((option) => option.family === family).colors.map((color) => color.code);

test("lists the requested blind families, lengths and color codes", () => {
  assert.deepEqual(colorCodes("BKFF"), ["9026-1", "9026-2", "9026-5", "9026-8", "MARRON"]);
  assert.deepEqual(BLIND_OPTIONS.find((option) => option.family === "BKFF").sizes, ["180", "240"]);
  assert.deepEqual(colorCodes("PZ"), ["M-4", "11-1", "11-2", "11-3", "11-6", "MARRON VIEJO", "MARRON VINOTINTO"]);
  assert.equal(BLIND_OPTIONS.find((option) => option.family === "PZ").colors.find((color) => color.code === "11-1").name, "Blanco");
  assert.equal(BLIND_OPTIONS.find((option) => option.family === "PZ").colors.find((color) => color.code === "11-2").name, "Blanco");
  assert.deepEqual(colorCodes("BKL"), ["621", "629", "614", "626"]);
});

test("creates a distinct orderable item for each BKFF size and color", () => {
  const short = createBlindProduct("BKFF", "180", "9026-1");
  const long = createBlindProduct("BKFF", "240", "9026-1");
  const otherColor = createBlindProduct("BKFF", "180", "9026-2");
  assert.notEqual(short.code, long.code);
  assert.notEqual(short.code, otherColor.code);
  assert.match(short.fullDescription, /180 cm de largo.*Negro \(9026-1\)/i);
  assert.match(long.fullDescription, /240 cm de largo.*Negro \(9026-1\)/i);
  assert.equal(short.customOrder, "blind");
});

test("creates PZ and BKL items with the selected color code and rejects invalid combinations", () => {
  const pz = createBlindProduct("PZ", "", "MARRON VIEJO");
  const pzWhiteOne = createBlindProduct("PZ", "", "11-1");
  const pzWhiteTwo = createBlindProduct("PZ", "", "11-2");
  const bkl = createBlindProduct("BKL", "", "629");
  assert.match(pz.fullDescription, /Marrón viejo \(MARRON VIEJO\)/i);
  assert.match(pzWhiteOne.fullDescription, /Blanco \(11-1\)/i);
  assert.match(pzWhiteTwo.fullDescription, /Blanco \(11-2\)/i);
  assert.notEqual(pzWhiteOne.code, pzWhiteTwo.code);
  assert.match(bkl.fullDescription, /Beige con verde \(629\)/i);
  assert.throws(() => createBlindProduct("PZ", "180", "9026-1"), /color válido/);
  assert.throws(() => createBlindProduct("BKFF", "120", "9026-1"), /largo válido/);
});
