import test from "node:test";
import assert from "node:assert/strict";
import {
  addLine,
  countCases,
  countMissingLines,
  emptyDraft,
  isExportable,
  normalizeDraft,
  reconcileDraft,
  removeLine,
  updateLine
} from "../src/order.js";

const firstProduct = { code: "000001", item: "TERMO", fullDescription: "TERMO DEPORTIVO", price: 12 };
const updatedProduct = { ...firstProduct, fullDescription: "TERMO DEPORTIVO 1L", price: 14 };
const secondProduct = { code: "000002", item: "POTES", fullDescription: "SET DE POTES", price: 8 };

test("adds and combines matching product lines without changing other units", () => {
  let draft = addLine(emptyDraft(), firstProduct, "2", "CJ");
  draft = addLine(draft, firstProduct, 3, "CJ");
  draft = addLine(draft, firstProduct, 1, "UND");
  assert.equal(draft.lines.length, 2);
  assert.equal(draft.lines[0].quantity, 5);
  assert.equal(countCases(draft), 5);
  assert.throws(() => addLine(draft, firstProduct, 0, "CJ"), /mayor que cero/);
  assert.throws(() => addLine(draft, firstProduct, 1, "INVALID"), /unidad/);
});

test("inventory replacement refreshes matching codes and preserves unmatched draft lines", () => {
  const draft = addLine(addLine(emptyDraft(), firstProduct, 2, "CJ"), secondProduct, 1, "UND");
  const updated = reconcileDraft(draft, [updatedProduct]);
  assert.equal(updated.lines[0].product.fullDescription, "TERMO DEPORTIVO 1L");
  assert.equal(updated.lines[0].quantity, 2);
  assert.equal(updated.lines[0].missing, false);
  assert.equal(updated.lines[1].product.code, "000002");
  assert.equal(updated.lines[1].missing, true);
  assert.equal(countMissingLines(updated), 1);
  assert.equal(isExportable(updated, [updatedProduct]), false);
  assert.equal(isExportable(reconcileDraft(draft, [updatedProduct, secondProduct]), [updatedProduct, secondProduct]), true);
});

test("validates line edits, removes lines and normalizes recovered drafts", () => {
  const draft = addLine(emptyDraft(), firstProduct, 2, "CJ");
  assert.throws(() => updateLine(draft, 0, { quantity: -1 }), /mayor que cero/);
  assert.throws(() => updateLine(draft, 1, { unit: "OTHER" }), /ya no existe/);
  assert.equal(updateLine(draft, 0, { unit: "PAQ" }).lines[0].unit, "PAQ");
  assert.equal(removeLine(draft, 0).lines.length, 0);
  const recovered = normalizeDraft({ orderNumber: "123", lines: [{ product: firstProduct, quantity: 0, unit: "CJ" }] });
  assert.equal(recovered.orderNumber, "123");
  assert.deepEqual(recovered.lines, []);
});
