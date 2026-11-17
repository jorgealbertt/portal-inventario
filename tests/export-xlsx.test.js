import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbookBytes, safeOrderFilename } from "../src/export-xlsx.js";

function storedZipEntry(bytes, expectedName) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const size = view.getUint32(offset + 18, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if (name === expectedName) return new TextDecoder().decode(bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  throw new Error(`Missing ZIP entry ${expectedName}`);
}

test("creates a valid workbook archive with an order and a full inventory sheet", () => {
  const inventory = [{
    code: "000001",
    item: "TERMO",
    fullDescription: "TERMO & TAPA",
    shortDescription: "& TAPA",
    department: "022",
    brand: "Marca",
    cost: 4.9,
    price: 12.67
  }];
  const draft = {
    manager: "María",
    phone: "555-0100",
    orderNumber: "0000042",
    lines: [{ product: inventory[0], quantity: 2.5, unit: "CJ" }]
  };
  const bytes = createWorkbookBytes(inventory, draft);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const workbook = storedZipEntry(bytes, "xl/workbook.xml");
  assert.match(workbook, /Nota de pedido/);
  assert.match(workbook, /Base_Inventario/);
  const orderSheet = storedZipEntry(bytes, "xl/worksheets/sheet1.xml");
  assert.match(orderSheet, /TERMO &amp; TAPA/);
  assert.match(orderSheet, /2\.5/);
  assert.ok(orderSheet.indexOf("<autoFilter") < orderSheet.indexOf("<mergeCells"));
  const inventorySheet = storedZipEntry(bytes, "xl/worksheets/sheet2.xml");
  assert.match(inventorySheet, /4\.9/);
  assert.match(inventorySheet, /12\.67/);
});

test("keeps exported order filenames safe", () => {
  assert.equal(safeOrderFilename("0000042"), "0000042");
  assert.equal(safeOrderFilename("../pedido 1"), "_pedido_1");
});
