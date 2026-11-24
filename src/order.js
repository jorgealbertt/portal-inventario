export const UNITS = ["CJ", "UND", "MT", "PAQ", "JGO"];

function roundQuantity(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return NaN;
  return Math.round((num + Number.EPSILON) * 1e6) / 1e6;
}

export function emptyDraft() {
  return { manager: "", phone: "", orderNumber: "0000001", lines: [] };
}

export function normalizeDraft(value) {
  if (!value || typeof value !== "object") return emptyDraft();
  const lines = Array.isArray(value.lines) ? value.lines : [];
  const rawOrderNumber = String(value.orderNumber ?? "0000001").trim().slice(0, 20);
  return {
    manager: String(value.manager || "").slice(0, 80),
    phone: String(value.phone || "").slice(0, 35),
    orderNumber: rawOrderNumber || "0000001",
    lines: lines.flatMap((line) => {
      const quantity = roundQuantity(line?.quantity);
      const unit = String(line?.unit || "").trim().toUpperCase();
      const product = line?.product;
      if (
        !product ||
        !String(product.code || "").trim() ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !UNITS.includes(unit)
      ) {
        return [];
      }
      return [{
        product: {
          ...product,
          code: String(product.code).trim()
        },
        quantity,
        unit,
        missing: Boolean(line.missing)
      }];
    })
  };
}

export function addLine(draft, product, quantity, unit) {
  const amount = roundQuantity(quantity);
  const normalizedUnit = String(unit || "").trim().toUpperCase();
  if (!product || !String(product.code || "").trim()) {
    throw new Error("Selecciona un producto válido.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("La cantidad debe ser mayor que cero.");
  }
  if (!UNITS.includes(normalizedUnit)) {
    throw new Error("Selecciona una unidad de medida válida.");
  }

  const lines = draft.lines.map((line) => ({ ...line }));
  const existing = lines.find(
    (line) =>
      !line.missing &&
      line.product.code.toLocaleLowerCase("es") === String(product.code).trim().toLocaleLowerCase("es") &&
      line.unit === normalizedUnit
  );
  if (existing) {
    existing.quantity = roundQuantity(existing.quantity + amount);
    existing.product = product;
  } else {
    lines.push({ product, quantity: amount, unit: normalizedUnit, missing: false });
  }
  return { ...draft, lines };
}

export function updateLine(draft, index, changes) {
  if (!Number.isInteger(index) || index < 0 || index >= draft.lines.length) {
    throw new Error("El renglón ya no existe.");
  }
  const lines = draft.lines.map((line, lineIndex) => {
    if (lineIndex !== index) return line;
    const quantity = changes.quantity === undefined ? line.quantity : roundQuantity(changes.quantity);
    const unit = changes.unit === undefined ? line.unit : String(changes.unit).trim().toUpperCase();
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("La cantidad debe ser mayor que cero.");
    }
    if (!UNITS.includes(unit)) {
      throw new Error("Selecciona una unidad de medida válida.");
    }
    return { ...line, quantity, unit };
  });
  return { ...draft, lines };
}

export function removeLine(draft, index) {
  if (!Number.isInteger(index) || index < 0 || index >= draft.lines.length) {
    return draft;
  }
  return { ...draft, lines: draft.lines.filter((_, lineIndex) => lineIndex !== index) };
}

export function reconcileDraft(draft, products) {
  const byCode = new Map(
    products.map((product) => [String(product.code).trim().toLocaleLowerCase("es"), product])
  );
  return {
    ...draft,
    lines: draft.lines.map((line) => {
      const key = String(line.product?.code || "").trim().toLocaleLowerCase("es");
      const current = byCode.get(key);
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
  const total = draft.lines.reduce((sum, line) => sum + (line.unit === "CJ" ? Number(line.quantity) || 0 : 0), 0);
  return roundQuantity(total);
}