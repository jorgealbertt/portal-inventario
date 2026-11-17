const encoder = new TextEncoder();
const spreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function xmlEscape(value) {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;"
  })[character]);
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function inlineCell(reference, value, style = 0) {
  const text = String(value ?? "");
  const styleAttribute = style ? ` s="${style}"` : "";
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function numberCell(reference, value, style = 0) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return inlineCell(reference, "", style);
  const styleAttribute = style ? ` s="${style}"` : "";
  return `<c r="${reference}"${styleAttribute}><v>${amount}</v></c>`;
}

function rowXml(rowNumber, cells, height) {
  const heightAttribute = height ? ` ht="${height}" customHeight="1"` : "";
  return `<row r="${rowNumber}"${heightAttribute}>${cells.join("")}</row>`;
}

function worksheetXml(rows, widths, freezeRows = 0) {
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const pane = freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${spreadsheetNamespace}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${pane}<cols>${columns}</cols><sheetData>${rows.join("")}</sheetData><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

function orderSheet(draft) {
  const rows = [];
  rows.push(rowXml(1, [inlineCell("A1", "COISA HOGAR, C.A.", 1), inlineCell("B1", ""), inlineCell("C1", ""), inlineCell("D1", ""), inlineCell("E1", `NOTA DE PEDIDO ${draft.orderNumber}`, 1)], 28));
  rows.push(rowXml(2, [inlineCell("A2", "Encargado responsable", 2), inlineCell("B2", draft.manager), inlineCell("C2", "Teléfono", 2), inlineCell("D2", draft.phone), inlineCell("E2", `Fecha: ${new Intl.DateTimeFormat("es-VE").format(new Date())}`)], 22));
  rows.push(rowXml(3, [inlineCell("A3", "RIF J-50086782-4"), inlineCell("B3", ""), inlineCell("C3", ""), inlineCell("D3", ""), inlineCell("E3", "")], 20));
  rows.push(rowXml(4, [
    inlineCell("A4", "CÓDIGO", 2), inlineCell("B4", "ITEM", 2), inlineCell("C4", "DESCRIPCIÓN", 2),
    inlineCell("D4", "CANTIDAD", 2), inlineCell("E4", "UNIDAD", 2)
  ], 24));
  draft.lines.forEach((line, index) => {
    const row = index + 5;
    rows.push(rowXml(row, [
      inlineCell(`A${row}`, line.product.code),
      inlineCell(`B${row}`, line.product.item),
      inlineCell(`C${row}`, line.product.fullDescription),
      numberCell(`D${row}`, line.quantity),
      inlineCell(`E${row}`, line.unit)
    ]));
  });
  const lastOrderRow = Math.max(4, draft.lines.length + 4);
  const xml = worksheetXml(rows, [18, 24, 58, 14, 12]);
  return xml
    .replace("</sheetData>", `</sheetData><autoFilter ref="A4:E${lastOrderRow}"/><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells>`)
    .replace("</worksheet>", `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`);
}

function inventorySheet(products) {
  const headers = ["CODIGO", "ITEM", "DESCRIPCION_COMPLETA", "DESCRIPCION_CORTA", "DEPARTAMENTO", "MARCA", "COSTO_ACTUAL", "PRECIO_1"];
  const rows = [rowXml(1, headers.map((header, index) => inlineCell(`${columnName(index)}1`, header, 2)), 28)];
  products.forEach((product, index) => {
    const row = index + 2;
    rows.push(rowXml(row, [
      inlineCell(`A${row}`, product.code),
      inlineCell(`B${row}`, product.item),
      inlineCell(`C${row}`, product.fullDescription),
      inlineCell(`D${row}`, product.shortDescription),
      inlineCell(`E${row}`, product.department),
      inlineCell(`F${row}`, product.brand),
      numberCell(`G${row}`, product.cost),
      numberCell(`H${row}`, product.price)
    ]));
  });
  const xml = worksheetXml(rows, [18, 22, 52, 48, 17, 26, 18, 18], 1);
  return xml.replace("</sheetData>", `</sheetData><autoFilter ref="A1:H${products.length + 1}"/>`);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[index] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function joinBytes(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function zipStore(files) {
  const localChunks = [];
  const directoryChunks = [];
  let offset = 0;
  for (const [path, content] of files) {
    const name = encoder.encode(path);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x0021, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    localHeader.set(name, 30);
    localChunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0x0021, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    directoryChunks.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const directory = joinBytes(directoryChunks);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directory.length, true);
  endView.setUint32(16, offset, true);
  return joinBytes([...localChunks, directory, end]);
}

export function createWorkbookBytes(inventory, draft) {
  if (!inventory.length || !draft.lines.length) throw new Error("Carga el inventario y agrega productos antes de exportar.");
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Nota de pedido" sheetId="1" r:id="rId1"/><sheet name="Base_Inventario" sheetId="2" r:id="rId2"/></sheets><calcPr calcMode="auto"/></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${spreadsheetNamespace}"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5597"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ["xl/worksheets/sheet1.xml", orderSheet(draft)],
    ["xl/worksheets/sheet2.xml", inventorySheet(inventory)]
  ];
  return zipStore(files);
}

export function createWorkbookBlob(inventory, draft) {
  const bytes = createWorkbookBytes(inventory, draft);
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function safeOrderFilename(orderNumber) {
  return String(orderNumber || "0000001").replace(/[^\w-]+/g, "_") || "0000001";
}
