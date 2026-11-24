const ACTIVE_VALUES = new Set(["1", "true", "si", "sí", "activo", "activa"]);

function localName(name) {
  return name.split(":").at(-1).toLowerCase();
}

function decodeXmlText(text) {
  if (/&(?![A-Za-z#][A-Za-z0-9#]*;)/.test(text)) {
    throw new Error("El XML contiene un carácter & sin escapar.");
  }
  return text.replace(/&([^;]*);/g, (entity, value) => {
    if (value === "amp") return "&";
    if (value === "lt") return "<";
    if (value === "gt") return ">";
    if (value === "quot") return '"';
    if (value === "apos") return "'";
    const decimal = /^#([0-9]+)$/.exec(value);
    const hexadecimal = /^#x([0-9a-f]+)$/i.exec(value);
    if (decimal || hexadecimal) {
      const codePoint = Number.parseInt((decimal || hexadecimal)[1], decimal ? 10 : 16);
      if (codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return String.fromCodePoint(codePoint);
      }
    }
    throw new Error("El XML contiene una entidad no válida.");
  });
}

function findTagEnd(xml, start) {
  let quote = "";
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  throw new Error("El XML termina con una etiqueta incompleta.");
}

function parseTag(source) {
  const match = /^<\s*(\/?)\s*([^\s/>]+)([\s\S]*?)\s*(\/?)>$/.exec(source);
  if (!match) throw new Error("El XML contiene una etiqueta no válida.");
  const closing = Boolean(match[1]);
  const selfClosing = !closing && Boolean(match[4]);
  if (closing && (match[3].trim() || match[4])) {
    throw new Error("El XML contiene una etiqueta de cierre no válida.");
  }
  return { name: localName(match[2]), closing, selfClosing };
}

function numberValue(value) {
  let normalized = String(value ?? "").trim().replace(/[\s\u00a0$]/g, "");
  if (!normalized) return 0;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const groupSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized.split(groupSeparator).join("");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (comma >= 0) {
    const fraction = normalized.length - comma - 1;
    normalized = fraction > 0 && fraction <= 2
      ? normalized.replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if ((normalized.match(/\./g) || []).length > 1) {
    const lastDot = normalized.lastIndexOf(".");
    normalized = normalized.slice(0, lastDot).replace(/\./g, "") + normalized.slice(lastDot);
  }
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finishRecord(record, totals) {
  totals.records += 1;
  const fields = record.fields;
  const activeFlag = (fields.activo || "").trim().toLowerCase();
  if (!ACTIVE_VALUES.has(activeFlag)) {
    totals.inactive += 1;
    return;
  }
  const code = (fields.codigodelproducto || fields.codigo || "").trim();
  const fullDescription = (fields.descripcion || fields.descripcion_completa || "").replace(/\s+/g, " ").trim();
  if (!code || !fullDescription) {
    totals.skipped += 1;
    return;
  }
  const codeKey = code.toLocaleLowerCase("es");
  if (totals.codes.has(codeKey)) {
    totals.duplicates.add(code);
    return;
  }
  totals.codes.add(codeKey);
  const splitAt = fullDescription.search(/\s/);
  const item = splitAt < 0 ? fullDescription : fullDescription.slice(0, splitAt);
  const shortDescription = splitAt < 0 ? "" : fullDescription.slice(splitAt).trim();
  totals.products.push({
    code,
    item,
    fullDescription,
    shortDescription,
    department: (fields.departamento || "").replace(/\s+/g, " ").trim(),
    brand: (fields.marca || "").replace(/\s+/g, " ").trim(),
    cost: numberValue(fields.costoactual || fields.costo || ""),
    price: numberValue(fields.precio1 || fields.precio || "")
  });
}

export function parseInventory(xmlText) {
  if (typeof xmlText !== "string" || !xmlText.trim()) {
    throw new Error("El archivo XML está vacío.");
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xmlText)) {
    throw new Error("Por seguridad, el XML no puede contener declaraciones DOCTYPE o ENTITY.");
  }

  const xml = xmlText.replace(/^\uFEFF/, "");
  const stack = [];
  const totals = {
    products: [],
    records: 0,
    inactive: 0,
    skipped: 0,
    codes: new Set(),
    duplicates: new Set()
  };
  let record = null;
  let recordDepth = -1;
  let currentField = null;
  let rootCount = 0;
  let rootName = "";
  let cursor = 0;

  const closeElement = (name) => {
    const current = stack.pop();
    if (!current || current.name !== name) throw new Error("El XML tiene etiquetas sin pareja.");
    if (record && currentField && stack.length === recordDepth + 1 && currentField.name === name) {
      if (!(name in record.fields)) record.fields[name] = currentField.parts.join("");
      currentField = null;
    }
    if (record && name === "registro" && stack.length === recordDepth) {
      finishRecord(record, totals);
      record = null;
      recordDepth = -1;
      currentField = null;
    }
  };

  while (cursor < xml.length) {
    const opening = xml.indexOf("<", cursor);
    const textEnd = opening === -1 ? xml.length : opening;
    if (textEnd > cursor && currentField && stack.length > recordDepth + 1) {
      currentField.parts.push(decodeXmlText(xml.slice(cursor, textEnd)));
    }
    if (opening === -1) {
      cursor = xml.length;
      break;
    }

    if (xml.startsWith("<!--", opening)) {
      const end = xml.indexOf("-->", opening + 4);
      if (end === -1) throw new Error("El XML contiene un comentario incompleto.");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", opening)) {
      const end = xml.indexOf("]]>", opening + 9);
      if (end === -1) throw new Error("El XML contiene una sección CDATA incompleta.");
      if (currentField && stack.length > recordDepth + 1) currentField.parts.push(xml.slice(opening + 9, end));
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", opening)) {
      const end = xml.indexOf("?>", opening + 2);
      if (end === -1) throw new Error("El XML contiene una instrucción incompleta.");
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("<!", opening)) throw new Error("El XML contiene una declaración no admitida.");

    const end = findTagEnd(xml, opening);
    const tag = parseTag(xml.slice(opening, end + 1));
    if (tag.closing) {
      closeElement(tag.name);
    } else {
      if (stack.length === 0) {
        rootCount += 1;
        if (rootCount > 1) throw new Error("El XML debe tener un solo elemento principal.");
        rootName = tag.name;
      }
      if (!record && tag.name === "registro") {
        record = { fields: Object.create(null) };
        recordDepth = stack.length;
      } else if (record && stack.length === recordDepth + 1) {
        currentField = { name: tag.name, parts: [] };
      }
      stack.push({ name: tag.name });
      if (tag.selfClosing) closeElement(tag.name);
    }
    cursor = end + 1;
  }

  if (stack.length || rootCount !== 1) throw new Error("El XML está incompleto o no tiene un elemento principal.");
  if (rootName !== "reportestellar") throw new Error("El archivo no parece ser un inventario exportado desde Stellar.");
  if (totals.records === 0) throw new Error("No se encontraron registros <Registro> en el XML.");
  if (totals.duplicates.size) {
    const examples = [...totals.duplicates].slice(0, 3).join(", ");
    throw new Error(`Hay códigos de producto repetidos (${examples}). Corrige el archivo en Stellar antes de cargarlo.`);
  }
  if (!totals.products.length) {
    throw new Error("No hay productos activos con código y descripción para cargar.");
  }
  return {
    products: totals.products,
    totalRecords: totals.records,
    inactiveRecords: totals.inactive,
    skippedRecords: totals.skipped
  };
}

export function formatInventorySummary(result) {
  const notes = [];
  if (result.inactiveRecords) notes.push(`${result.inactiveRecords} inactivos`);
  if (result.skippedRecords) notes.push(`${result.skippedRecords} sin código o descripción`);
  return notes.length ? notes.join(" · ") : "Todos los registros activos están disponibles.";
}