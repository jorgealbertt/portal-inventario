import test from "node:test";
import assert from "node:assert/strict";
import { formatInventorySummary, parseInventory } from "../src/inventory.js";

const inventoryXml = `<?xml version="1.0" encoding="UTF-8"?>
<ReporteStellar>
  <Registro>
    <CodigoDelProducto>000001</CodigoDelProducto><Descripcion>1000MLT TERMO &amp; TAPA</Descripcion>
    <Departamento>022</Departamento><Marca>TERMOS</Marca><Activo>1</Activo>
    <CostoActual>4,90</CostoActual><Precio1>12.67</Precio1>
  </Registro>
  <Registro><CodigoDelProducto>000002</CodigoDelProducto><Descripcion>Producto inactivo</Descripcion><Activo>0</Activo></Registro>
  <Registro><CodigoDelProducto></CodigoDelProducto><Descripcion>Sin código</Descripcion><Activo>1</Activo></Registro>
  <Registro><CodigoDelProducto>000003</CodigoDelProducto><Descripcion>Artículo disponible</Descripcion><Activo>1</Activo><Precio1>1.234,56</Precio1></Registro>
</ReporteStellar>`;

test("reads active Stellar records, preserves codes and converts numeric formats", () => {
  const result = parseInventory(inventoryXml);
  assert.equal(result.totalRecords, 4);
  assert.equal(result.inactiveRecords, 1);
  assert.equal(result.skippedRecords, 1);
  assert.deepEqual(result.products.map((product) => product.code), ["000001", "000003"]);
  assert.equal(result.products[0].fullDescription, "1000MLT TERMO & TAPA");
  assert.equal(result.products[0].item, "1000MLT");
  assert.equal(result.products[0].cost, 4.9);
  assert.equal(result.products[0].price, 12.67);
  assert.equal(result.products[1].price, 1234.56);
  assert.match(formatInventorySummary(result), /1 inactivos/);
});

test("accepts namespaces, CDATA and numeric character references", () => {
  const xml = `<s:ReporteStellar xmlns:s="urn:stellar"><s:Registro><s:CodigoDelProducto>AB-1</s:CodigoDelProducto><s:Descripcion><![CDATA[ITEM <especial>]]> &#x26; más</s:Descripcion><s:Activo>true</s:Activo></s:Registro></s:ReporteStellar>`;
  const result = parseInventory(xml);
  assert.equal(result.products[0].fullDescription, "ITEM <especial> & más");
});

test("rejects malformed, unrelated and unsafe XML without a usable inventory", () => {
  assert.throws(() => parseInventory(""), /vacío/);
  assert.throws(() => parseInventory("<ReporteStellar><Registro>"), /incompleto/);
  assert.throws(() => parseInventory("<Catalogo/>"), /Stellar/);
  assert.throws(() => parseInventory("<!DOCTYPE x><ReporteStellar/>"), /DOCTYPE/);
  assert.throws(() => parseInventory("<ReporteStellar><Registro><CodigoDelProducto>A</CodigoDelProducto><Descripcion>X</Descripcion><Activo>1</Activo></Registro><Registro><CodigoDelProducto>A</CodigoDelProducto><Descripcion>Y</Descripcion><Activo>1</Activo></Registro></ReporteStellar>"), /repetidos/);
});

test("rejects unescaped ampersands and inventories without active products", () => {
  assert.throws(() => parseInventory("<ReporteStellar><Registro><CodigoDelProducto>A</CodigoDelProducto><Descripcion>Pan & leche</Descripcion><Activo>1</Activo></Registro></ReporteStellar>"), /sin escapar/);
  assert.throws(() => parseInventory("<ReporteStellar><Registro><CodigoDelProducto>A</CodigoDelProducto><Descripcion>Descontinuado</Descripcion><Activo>0</Activo></Registro></ReporteStellar>"), /No hay productos activos/);
});
