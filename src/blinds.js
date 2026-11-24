export const BLIND_OPTIONS = [
  {
    family: "BKFF",
    label: "BKFF",
    sizes: ["180", "240"],
    colors: [
      { code: "9026-1", name: "Negro" },
      { code: "9026-2", name: "Blanco" },
      { code: "9026-5", name: "Gris claro" },
      { code: "9026-8", name: "Gris oscuro" },
      { code: "MARRON", name: "Marrón" }
    ]
  },
  {
    family: "PZ",
    label: "PZ",
    sizes: [],
    colors: [
      { code: "M-4", name: "Marrón" },
      { code: "11-1", name: "Blanco" },
      { code: "11-2", name: "Blanco" },
      { code: "11-3", name: "Gris oscuro" },
      { code: "11-6", name: "Gris claro" },
      { code: "MARRON VIEJO", name: "Marrón viejo" },
      { code: "MARRON VINOTINTO", name: "Marrón vinotinto" }
    ]
  },
  {
    family: "BKL",
    label: "BKL",
    sizes: [],
    colors: [
      { code: "621", name: "Gris claro con verde" },
      { code: "629", name: "Beige con verde" },
      { code: "614", name: "Gris oscuro" },
      { code: "626", name: "Gris-beige y verde" }
    ]
  }
];

export function createBlindProduct(family, size, colorCode) {
  const option = BLIND_OPTIONS.find((candidate) => candidate.family === family);
  if (!option) throw new Error("Selecciona un tipo de persiana válido.");
  if (option.sizes.length && !option.sizes.includes(String(size))) {
    throw new Error("Selecciona un largo válido para la persiana BKFF.");
  }
  const color = option.colors.find((candidate) => candidate.code === colorCode);
  if (!color) throw new Error("Selecciona un color válido para esta persiana.");

  const sizeLabel = option.sizes.length ? ` x ${size} cm de largo` : "";
  const item = `PERSIANA ${option.label}${sizeLabel}`;
  const colorLabel = `${color.name} (${color.code})`;
  const fullDescription = `${item} · ${colorLabel}`;
  const code = `${option.family}${option.sizes.length ? `-${size}CM` : ""}-${color.code}`;
  return {
    code,
    item,
    fullDescription,
    shortDescription: colorLabel,
    department: "",
    brand: "",
    cost: 0,
    price: 0,
    customOrder: "blind"
  };
}
