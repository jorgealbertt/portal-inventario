import { unzipSync } from "fflate";
import { UNITS } from "./order.js";

const decoder = new TextDecoder();

function decodeXml(value) {
  if (/&(?![A-Za-z#][A-Za-z0-9#]*;)/.test(value)) {
    throw new Error("El Excel contiene XML con entidades no válidas.");
  }
  return value.replace(/&([^;]*);/g, (entity, name) => {
    if (name === "amp") return "&";
    if (name === "lt") return "<";
    if (name === "gt") return ">";
    if (name === "quot") return '"';
    if (name === "apos") return "'";
    const decimal = /^#([0-9]+)$/.exec(name);
    const hexadecimal = /^#x([0-9a-f]+)$/i.exec(name);
    if (decimal || hexadecimal) {
      const codePoint = Number.parseInt((decimal || hexadecimal)[1], decimal ? 10 : 16);
      if (codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return String.fromCodePoint(codePoint);
      }
    }
    throw new Error("El Excel contiene una entidad XML no admitida.");
  });
}

function attribute(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(source);
  return match ? decodeXml(match[1] ?? match[2]) : "";
}

function textRuns(xml) {
  return [...xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t\s*>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleUpperCase("es")
    .replace(/[^A-Z0-9]/g, "");
}

function columnIndex(reference) {
  const letters = /^[A-Z]+/i.exec(reference)?.[0].toUpperCase();
  if (!letters) return -1;
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function normalizeArchivePath(target) {
  const parts = target.startsWith("/") ? [] : ["xl"];
  for (const part of target.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function readArchiveXml(files, path, description) {
  const file = files[path];
  if (!file) throw new Error(`El Excel no contiene ${description}.`);
  return decoder.decode(file);
}

function sharedStrings(xml) {
  return [...xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?si\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?si\s*>/g)]
    .map((match) => textRuns(match[1]));
}

function workbookSheet(files) {
  const workbook = readArchiveXml(files, "xl/workbook.xml", "un libro de trabajo válido");
  const sheetTag = /<(?:[A-Za-z_][\w.-]*:)?sheet\b([^>]*)\/?>/.exec(workbook);
  if (!sheetTag) throw new Error("El Excel no contiene una hoja de pedidos.");
  const relationships = readArchiveXml(files, "xl/_rels/workbook.xml.rels", "las relaciones de sus hojas");
  const relationshipId = attribute(sheetTag[1], "r:id");
  const relationTag = [...relationships.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .find((match) => attribute(match[1], "Id") === relationshipId);
  const target = relationTag ? attribute(relationTag[1], "Target") : "";
  if (!target) throw new Error("No se pudo localizar la primera hoja del Excel.");
  return {
    name: attribute(sheetTag[1], "name") || "Hoja 1",
    path: normalizeArchivePath(target)
  };
}

function cellValue(attributes, body, strings) {
  const type = attribute(attributes, "t");
  if (type === "inlineStr") {
    const inline = /<(?:[A-Za-z_][\w.-]*:)?is\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?is\s*>/.exec(body);
    return inline ? textRuns(inline[1]) : "";
  }
  const value = /<(?:[A-Za-z_][\w.-]*:)?v\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?v\s*>/.exec(body)?.[1];
  if (value === undefined) return "";
  const decoded = decodeXml(value);
  if (type === "s") return strings[Number(decoded)] ?? "";
  return decoded;
}

function worksheetRows(xml, strings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?row\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?row\s*>/g)) {
    const rowNumber = Number(attribute(rowMatch[1], "r")) || rows.length + 1;
    const cells = new Map();
    const cellPattern = /<(?:[A-Za-z_][\w.-]*:)?c\b([^>]*)\/>|<(?:[A-Za-z_][\w.-]*:)?c\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?c\s*>/g;
    for (const match of rowMatch[2].matchAll(cellPattern)) {
      const attributes = match[1] ?? match[2];
      const reference = attribute(attributes, "r");
      const index = columnIndex(reference);
      if (index >= 0) cells.set(index, cellValue(attributes, match[3] || "", strings));
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function headerIndex(cells, aliases) {
  for (const [index, value] of cells) {
    if (aliases.has(normalizeHeader(value))) return index;
  }
  return -1;
}

const HEADER_ALIASES = {
  code: new Set(["CODIGO", "CODIGOPRODUCTO", "CODIGOARTICULO", "CODARTICULO", "REFERENCIA"]),
  item: new Set(["ITEM", "ARTICULO", "PRODUCTO", "NOMBRE"]),
  description: new Set(["DESCRIPCION", "DETALLE"]),
  quantity: new Set(["CANTIDAD", "CANT", "QTY", "CANTIDADUNIDAD"]),
  unit: new Set(["UNIDAD", "UNIDADDEMEDIDA", "MEDIDA"])
};

const UNIT_ALIASES = new Map([
  ["CJ", "CJ"], ["CAJ", "CJ"], ["CAJA", "CJ"], ["CAJAS", "CJ"],
  ["UND", "UND"], ["UN", "UND"], ["UNIDAD", "UND"], ["UNIDADES", "UND"], ["PZA", "UND"], ["PIEZA", "UND"],
  ["MT", "MT"], ["M", "MT"], ["METRO", "MT"], ["METROS", "MT"],
  ["PAQ", "PAQ"], ["PAQUETE", "PAQ"], ["PAQUETES", "PAQ"],
  ["JGO", "JGO"], ["JUEGO", "JGO"], ["JUEGOS", "JGO"]
]);

function parseUnit(value) {
  const normalized = normalizeHeader(value);
  const unit = UNIT_ALIASES.get(normalized);
  return UNITS.includes(unit) ? unit : "";
}

function quantityAndUnit(value, separateUnit) {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([^\d\s].*?)?\s*$/.exec(String(value || ""));
  if (!match) return null;
  const quantity = Number(match[1].replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const embeddedUnit = parseUnit(match[2] || "");
  const columnUnit = parseUnit(separateUnit);
  if (match[2] && !embeddedUnit) return null;
  if (embeddedUnit && columnUnit && embeddedUnit !== columnUnit) return null;
  const unit = embeddedUnit || columnUnit;
  return unit ? { quantity, unit } : null;
}

function productRows(rows) {
  const headers = rows.slice(0, 40).find(({ cells }) =>
    headerIndex(cells, HEADER_ALIASES.code) >= 0 &&
    headerIndex(cells, HEADER_ALIASES.quantity) >= 0
  );
  if (!headers) {
    throw new Error("No encontré encabezados de código y cantidad en la primera hoja del Excel.");
  }
  const codeColumn = headerIndex(headers.cells, HEADER_ALIASES.code);
  const itemColumn = headerIndex(headers.cells, HEADER_ALIASES.item);
  const descriptionColumn = headerIndex(headers.cells, HEADER_ALIASES.description);
  const quantityColumn = headerIndex(headers.cells, HEADER_ALIASES.quantity);
  const unitColumn = headerIndex(headers.cells, HEADER_ALIASES.unit);
  const lines = [];
  const skippedRows = [];
  for (const row of rows) {
    if (row.rowNumber <= headers.rowNumber) continue;
    const code = String(row.cells.get(codeColumn) || "").trim();
    if (!code) continue;
    const parsed = quantityAndUnit(row.cells.get(quantityColumn), row.cells.get(unitColumn));
    if (!parsed) {
      skippedRows.push(row.rowNumber);
      continue;
    }
    lines.push({
      code,
      item: String(row.cells.get(itemColumn) || "").trim(),
      description: String(row.cells.get(descriptionColumn) || "").trim(),
      ...parsed
    });
  }
  if (!lines.length) throw new Error("No encontré renglones con código, cantidad y una unidad válida (CJ, UND, MT, PAQ o JGO).");
  return { lines, skippedRows };
}

export function parseOrderWorkbook(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 4) throw new Error("El archivo Excel está vacío o incompleto.");

  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("No se pudo abrir el Excel. Selecciona un archivo .xlsx válido y sin contraseña.");
  }

  const sheet = workbookSheet(files);
  const workbook = readArchiveXml(files, sheet.path, "la primera hoja de pedidos");
  const strings = files["xl/sharedStrings.xml"]
    ? sharedStrings(decoder.decode(files["xl/sharedStrings.xml"]))
    : [];
  const { lines, skippedRows } = productRows(worksheetRows(workbook, strings));
  return { lines, skippedRows, sheetName: sheet.name };
}
