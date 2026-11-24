export const UNITS = ["CJ", "UND", "MT", "PAQ", "JGO"];

export function normalizeProductCode(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0020\u00a0]/g, "")
    .toLocaleUpperCase("es")
    .replace(/[_.\-/\\]+/g, "");
}

export function emptyDraft() {
  return { manager: "", phone: "", orderNumber: "0000001", lines: [] };
}

export function normalizeDraft(value) {
  if (!value || typeof value !== "object") return emptyDraft();
  const lines = Array.isArray(value.lines) ? value.lines : [];
  return {
    manager: String(value.manager || "").slice(0, 80),
    phone: String(value.phone || "").slice(0, 35),
    orderNumber: String(value.orderNumber || "0000001").slice(0, 20),
    lines: lines.flatMap((line) => {
      const quantity = Number(line?.quantity);
      const unit = String(line?.unit || "");
      const product = line?.product;
      if (!product || !String(product.code || "").trim() || !Number.isFinite(quantity) || quantity <= 0 || !UNITS.includes(unit)) return [];
      return [{
        product,
        quantity,
        unit,
        missing: Boolean(line.missing)
      }];
    })
  };
}

export function addLine(draft, product, quantity, unit) {
  const amount = Number(quantity);
  if (!product || !String(product.code || "").trim()) throw new Error("Selecciona un producto válido.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("La cantidad debe ser mayor que cero.");
  if (!UNITS.includes(unit)) throw new Error("Selecciona una unidad de medida válida.");

  const lines = draft.lines.map((line) => ({ ...line }));
  const code = normalizeProductCode(product.code);
  const existing = lines.find((line) =>
    !line.missing &&
    normalizeProductCode(line.product.code) === code &&
    line.unit === unit
  );
  if (existing) {
    existing.quantity += amount;
    existing.product = product;
  } else {
    lines.push({ product, quantity: amount, unit, missing: false });
  }
  return { ...draft, lines };
}

export function updateLine(draft, index, changes) {
  if (!Number.isInteger(index) || index < 0 || index >= draft.lines.length) throw new Error("El renglón ya no existe.");
  const lines = draft.lines.map((line, lineIndex) => {
    if (lineIndex !== index) return line;
    const quantity = changes.quantity === undefined ? line.quantity : Number(changes.quantity);
    const unit = changes.unit === undefined ? line.unit : changes.unit;
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("La cantidad debe ser mayor que cero.");
    if (!UNITS.includes(unit)) throw new Error("Selecciona una unidad de medida válida.");
    return { ...line, quantity, unit };
  });
  return { ...draft, lines };
}

export function removeLine(draft, index) {
  return { ...draft, lines: draft.lines.filter((_, lineIndex) => lineIndex !== index) };
}

export function reconcileDraft(draft, products) {
  const byCode = new Map(products.map((product) => [normalizeProductCode(product.code), product]));
  return {
    ...draft,
    lines: draft.lines.map((line) => {
      const current = byCode.get(normalizeProductCode(line.product.code));
      return current
        ? { ...line, product: current, missing: false }
        : { ...line, missing: true };
    })
  };
}

export function countMissingLines(draft) {
  return draft.lines.filter((line) => line.missing).length;
}

export function isExportable(draft, inventory) {
  return inventory.length > 0 && draft.lines.length > 0 && countMissingLines(draft) === 0;
}

export function countCases(draft) {
  return draft.lines.reduce((sum, line) => sum + (line.unit === "CJ" ? line.quantity : 0), 0);
}
