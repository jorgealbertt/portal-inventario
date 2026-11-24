import "./styles.css";
import { formatInventorySummary, parseInventory } from "./inventory.js";
import { parseOrderWorkbook } from "./import-xlsx.js";
import { createWorkbookBlob, safeOrderFilename } from "./export-xlsx.js";
import {
  addLine,
  countCases,
  countMissingLines,
  emptyDraft,
  isExportable,
  normalizeDraft,
  normalizeProductCode,
  reconcileDraft,
  removeLine,
  updateLine,
  UNITS
} from "./order.js";
