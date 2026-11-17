import "./styles.css";
import { formatInventorySummary, parseInventory } from "./inventory.js";
import { createWorkbookBlob, safeOrderFilename } from "./export-xlsx.js";
import {
  addLine,
  countCases,
  countMissingLines,
  emptyDraft,
  isExportable,
  normalizeDraft,
  reconcileDraft,
  removeLine,
  updateLine,
  UNITS
} from "./order.js";
import { readSavedState, writeDraft, writeSavedState } from "./storage.js";

const $ = (id) => document.getElementById(id);
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const PAGE_SIZE = 80;
const state = { inventory: [], inventoryInfo: null, draft: emptyDraft() };
let selectedProduct = null;
let visibleProducts = PAGE_SIZE;
let toastTimer;
let draftSaveTimer;
let persistenceQueue = Promise.resolve();
let installPrompt = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function showMessage(message, kind = "error") {
  const element = $("importMessage");
  element.textContent = message;
  element.className = `message${kind === "success" ? " is-success" : kind === "info" ? " is-info" : ""}`;
  element.hidden = false;
}

function clearMessage() {
  $("importMessage").hidden = true;
  $("importMessage").textContent = "";
}

function inventorySnapshot(inventory = state.inventory, info = state.inventoryInfo) {
  return { products: inventory, info };
}

function stateSnapshot(nextState = state) {
  return {
    inventory: inventorySnapshot(nextState.inventory, nextState.inventoryInfo),
    draft: nextState.draft
  };
}

function saveDraftSoon() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    const draft = state.draft;
    persistenceQueue = persistenceQueue
      .then(() => writeDraft(draft))
      .catch((error) => {
        showMessage(`No se guardaron los cambios en este dispositivo: ${error.message || "error de almacenamiento"}. Mantén esta pestaña abierta y descarga el pedido.`, "error");
      });
  }, 350);
}

function saveDraft(nextDraft, rerender = true) {
  state.draft = nextDraft;
  if (rerender) renderOrder();
  saveDraftSoon();
}

function money(value) {
  return new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function inventoryDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "fecha desconocida"
    : new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function updateInventoryBadge() {
  const badge = $("inventoryBadge");
  if (!state.inventory.length) {
    badge.classList.remove("is-ready");
    badge.innerHTML = '<span class="status-dot"></span><span>Inventario pendiente</span>';
    $("fileStatus").textContent = "Carga el archivo XML actualizado de Stellar";
    $("fileDetail").textContent = "Tu inventario se queda guardado en este dispositivo.";
    $("searchInput").disabled = true;
    $("departmentFilter").disabled = true;
    $("quantityInput").disabled = true;
    $("unitInput").disabled = true;
    $("addButton").disabled = true;
    return;
  }
  const info = state.inventoryInfo || {};
  const loadedAt = info.loadedAt ? inventoryDate(info.loadedAt) : "fecha desconocida";
  badge.classList.add("is-ready");
  badge.innerHTML = `<span class="status-dot"></span><span>${state.inventory.length.toLocaleString("es-VE")} productos · ${escapeHtml(loadedAt)}</span>`;
  $("fileStatus").textContent = info.fileName || "Inventario guardado en este dispositivo";
  $("fileDetail").textContent = `${state.inventory.length.toLocaleString("es-VE")} productos activos · Actualizado ${loadedAt}`;
  $("searchInput").disabled = false;
  $("departmentFilter").disabled = false;
  $("quantityInput").disabled = false;
  $("unitInput").disabled = false;
  $("addButton").disabled = !selectedProduct;
}

function renderDepartments() {
  const select = $("departmentFilter");
  const selected = select.value;
  const departments = [...new Set(state.inventory.map((product) => product.department).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "es", { numeric: true }));
  select.replaceChildren(new Option("Todos", ""));
  for (const department of departments) {
    select.add(new Option(`Departamento ${department}`, department));
  }
  if (departments.includes(selected)) select.value = selected;
}

function matchingProducts() {
  const query = $("searchInput").value.trim().toLocaleLowerCase("es");
  const department = $("departmentFilter").value;
  return state.inventory.filter((product) => {
    if (department && product.department !== department) return false;
    if (!query) return true;
    return [product.code, product.item, product.fullDescription, product.brand, product.department]
      .some((value) => String(value || "").toLocaleLowerCase("es").includes(query));
  });
}

function renderProducts() {
  const filtered = matchingProducts();
  const shown = filtered.slice(0, visibleProducts);
  $("resultCount").textContent = state.inventory.length
    ? `${filtered.length.toLocaleString("es-VE")} ${filtered.length === 1 ? "producto" : "productos"}`
    : "Primero carga el inventario";
  $("resultLimit").textContent = filtered.length > shown.length
    ? `Mostrando ${shown.length.toLocaleString("es-VE")} de ${filtered.length.toLocaleString("es-VE")}`
    : "";
  $("clearSearch").hidden = !$("searchInput").value;
  $("showMoreButton").hidden = filtered.length <= shown.length;

  const list = $("productList");
  if (!state.inventory.length) {
    list.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true">▦</span><strong>Tu catálogo aparecerá aquí</strong><span>Selecciona el XML que exportaste desde Stellar.</span></div>';
    return;
  }
  if (!shown.length) {
    list.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><strong>No encontramos productos</strong><span>Prueba con otro código, nombre o departamento.</span></div>';
    return;
  }
  list.innerHTML = shown.map((product) => `
    <button class="product-row${selectedProduct?.code === product.code ? " is-selected" : ""}" type="button" data-code="${escapeHtml(product.code)}" aria-pressed="${selectedProduct?.code === product.code}">
      <span class="product-code">${escapeHtml(product.code)}</span>
      <span class="product-description"><strong>${escapeHtml(product.fullDescription)}</strong><small>${escapeHtml(product.brand || "Sin marca")} · Dpto. ${escapeHtml(product.department || "—")}</small></span>
      <span class="product-price">${money(product.price)}<small>Precio 1</small></span>
    </button>`).join("");
}

function renderOrder() {
  const draft = state.draft;
  const missing = countMissingLines(draft);
  const lineCount = draft.lines.length;
  const countText = `${lineCount.toLocaleString("es-VE")} ${lineCount === 1 ? "producto" : "productos"}`;
  $("rowCounter").textContent = countText;
  $("mobileLineCount").textContent = lineCount > 99 ? "99+" : String(lineCount);
  $("lineTotal").textContent = lineCount.toLocaleString("es-VE");
  $("caseTotal").textContent = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(countCases(draft));
  $("managerInput").value = draft.manager;
  $("phoneInput").value = draft.phone;
  $("orderInput").value = draft.orderNumber;
  $("exportButton").disabled = !isExportable(draft, state.inventory);
  $("clearOrderButton").disabled = lineCount === 0;
  $("orderHint").textContent = missing
    ? "Hay productos que debes revisar antes de descargar."
    : "Los cambios se guardan automáticamente.";
  const notice = $("reconcileNotice");
  notice.hidden = !missing;
  notice.textContent = missing
    ? `${missing === 1 ? "Un producto ya no aparece" : `${missing} productos ya no aparecen`} en el inventario actual. Elimina ${missing === 1 ? "ese renglón" : "esos renglones"} o agrégalos de nuevo con su código actualizado para poder descargar.`
    : "";

  const content = $("requestContent");
  if (!lineCount) {
    content.innerHTML = '<div class="request-empty"><span class="empty-icon" aria-hidden="true">▤</span><strong>Tu pedido está vacío</strong><span>Agrega productos desde el catálogo.</span></div>';
    return;
  }
  content.innerHTML = `<div class="request-lines">${draft.lines.map((line, index) => `
    <div class="order-line">
      <span class="order-line-product">
        <strong>${escapeHtml(line.product.fullDescription || line.product.item)}</strong>
        <small class="${line.missing ? "stale-label" : ""}">${escapeHtml(line.product.code)}${line.missing ? " · No está en el inventario actual" : ""}</small>
      </span>
      <input class="line-quantity" type="number" min="0.01" step="any" value="${escapeHtml(line.quantity)}" aria-label="Cantidad para ${escapeHtml(line.product.item)}" data-line-quantity="${index}">
      <select class="line-unit" aria-label="Unidad para ${escapeHtml(line.product.item)}" data-line-unit="${index}">
        ${UNITS.map((unit) => `<option${line.unit === unit ? " selected" : ""}>${unit}</option>`).join("")}
      </select>
      <button class="remove-line" type="button" aria-label="Eliminar ${escapeHtml(line.product.item)}" data-remove-line="${index}">×</button>
    </div>`).join("")}</div>`;
}

function renderAll() {
  updateInventoryBadge();
  renderProducts();
  renderOrder();
}

function setSelectedProduct(product) {
  selectedProduct = product;
  $("selectedProduct").textContent = product
    ? `${product.code} · ${product.fullDescription}`
    : "Toca un producto del catálogo.";
  $("selectedProduct").parentElement.classList.toggle("has-selection", Boolean(product));
  $("addButton").disabled = !product;
  renderProducts();
  const selectedButton = [...$("productList").querySelectorAll("[data-code]")]
    .find((button) => button.dataset.code === product?.code);
  selectedButton?.focus({ preventScroll: true });
}

function setImportBusy(busy) {
  $("loadButton").disabled = busy;
  $("loadTopButton").disabled = busy;
  $("dropZone").disabled = busy;
  $("catalogPanel").setAttribute("aria-busy", String(busy));
  $("orderPanel").setAttribute("aria-busy", String(busy));
  for (const id of ["managerInput", "phoneInput", "orderInput", "quantityInput", "unitInput", "addButton", "exportButton", "clearOrderButton"]) {
    $(id).disabled = busy || (id === "quantityInput" || id === "unitInput" || id === "addButton") && !state.inventory.length ||
      id === "addButton" && !selectedProduct ||
      id === "exportButton" && !isExportable(state.draft, state.inventory) ||
      id === "clearOrderButton" && !state.draft.lines.length;
  }
  $("requestContent").querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = busy;
  });
}

function updateDraftField(field, value) {
  state.draft = { ...state.draft, [field]: value };
  saveDraftSoon();
}

async function stageInventory(file) {
  if (!file) return;
  clearMessage();
  if (file.size > MAX_FILE_SIZE) {
    showMessage("El archivo supera el límite de 20 MB. Exporta el inventario nuevamente desde Stellar.");
    return;
  }

  clearTimeout(draftSaveTimer);
  let committed = false;
  setImportBusy(true);
  $("fileStatus").textContent = "Leyendo y validando el inventario…";
  $("fileDetail").textContent = "La versión anterior sigue disponible mientras se revisa el archivo.";

  try {
    const result = parseInventory(await file.text());
    const nextDraft = reconcileDraft(state.draft, result.products);
    const missing = countMissingLines(nextDraft);
    if (state.draft.lines.length) {
      const details = missing
        ? `Se conservarán los ${state.draft.lines.length} productos del pedido. ${missing} no coinciden con el nuevo inventario y quedarán marcados para revisar; deberás quitarlos o volverlos a agregar antes de exportar.`
        : `Se conservarán los ${state.draft.lines.length} productos del pedido y se actualizarán sus descripciones y precios con este inventario.`;
      if (!window.confirm(`¿Reemplazar el inventario actual?\n\n${details}`)) {
        showMessage("No se cambió el inventario. Tu pedido y la versión anterior siguen intactos.", "info");
        return;
      }
    }

    const info = {
      fileName: file.name,
      loadedAt: new Date().toISOString(),
      productCount: result.products.length,
      totalRecords: result.totalRecords,
      inactiveRecords: result.inactiveRecords,
      skippedRecords: result.skippedRecords,
      fileSize: file.size
    };
    const nextState = { inventory: result.products, inventoryInfo: info, draft: nextDraft };
    const save = persistenceQueue.then(() => writeSavedState(stateSnapshot(nextState)));
    persistenceQueue = save.catch((error) => {
      showMessage(`El inventario no se reemplazó porque no se pudo guardar en este dispositivo: ${error.message || "error de almacenamiento"}.`, "error");
    });
    await save;
    state.inventory = nextState.inventory;
    state.inventoryInfo = nextState.inventoryInfo;
    state.draft = nextState.draft;
    selectedProduct = null;
    visibleProducts = PAGE_SIZE;
    $("searchInput").value = "";
    $("departmentFilter").value = "";
    $("selectedProduct").textContent = "Toca un producto del catálogo.";
    $("selectedProduct").parentElement.classList.remove("has-selection");
    renderDepartments();
    renderAll();
    committed = true;

    const summary = formatInventorySummary(result);
    const note = result.inactiveRecords || result.skippedRecords ? ` ${summary}` : "";
    showMessage(`Inventario actualizado: ${result.products.length.toLocaleString("es-VE")} productos activos. ${info.fileName} · ${inventoryDate(info.loadedAt)}.${note}`, "success");
    showToast("Inventario guardado en este dispositivo.");
  } catch (error) {
    const current = state.inventoryInfo;
    if (current) {
      $("fileStatus").textContent = current.fileName;
      $("fileDetail").textContent = `${state.inventory.length.toLocaleString("es-VE")} productos · versión anterior sin cambios.`;
    }
    showMessage(error.message || "No se pudo leer el inventario. La versión anterior no cambió.");
  } finally {
    setImportBusy(false);
    if (!committed) updateInventoryBadge();
    $("xmlFile").value = "";
  }
}

function downloadOrder() {
  if (!isExportable(state.draft, state.inventory)) {
    showToast(countMissingLines(state.draft) ? "Revisa los productos que ya no están en el inventario." : "Agrega al menos un producto al pedido.");
    return;
  }
  try {
    const blob = createWorkbookBlob(state.inventory, state.draft);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Nota_de_Pedido_${safeOrderFilename(state.draft.orderNumber)}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Archivo Excel descargado.");
  } catch (error) {
    showMessage(`No se pudo generar el Excel: ${error.message || "error al crear el archivo"}.`);
  }
}

function setMobileView(view) {
  document.body.dataset.mobileView = view;
  document.querySelectorAll("[data-mobile-view]").forEach((button) => {
    const active = button.dataset.mobileView === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function configureImportControls() {
  const input = $("xmlFile");
  const choose = () => {
    try {
      if (typeof input.showPicker === "function") input.showPicker();
      else input.click();
    } catch (pickerError) {
      try {
        input.click();
      } catch (clickError) {
        showMessage(`No se pudo abrir el selector de archivos: ${clickError.message || pickerError.message || "intenta tocar «Elegir archivo» otra vez"}.`);
      }
    }
  };
  $("loadButton").addEventListener("click", choose);
  $("loadTopButton").addEventListener("click", choose);
  $("dropZone").addEventListener("click", choose);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    stageInventory(file);
  });
  const dropZone = $("dropZone");
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  }
  dropZone.addEventListener("drop", (event) => stageInventory(event.dataTransfer?.files?.[0]));
}

function configureOrderControls() {
  $("productList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-code]");
    if (!button) return;
    const product = state.inventory.find((item) => item.code === button.dataset.code);
    if (product) setSelectedProduct(product);
  });
  $("searchInput").addEventListener("input", () => {
    visibleProducts = PAGE_SIZE;
    renderProducts();
  });
  $("clearSearch").addEventListener("click", () => {
    $("searchInput").value = "";
    $("searchInput").focus();
    visibleProducts = PAGE_SIZE;
    renderProducts();
  });
  $("departmentFilter").addEventListener("change", () => {
    visibleProducts = PAGE_SIZE;
    renderProducts();
  });
  $("showMoreButton").addEventListener("click", () => {
    visibleProducts += PAGE_SIZE;
    renderProducts();
  });
  const addSelected = () => {
    if (!selectedProduct) return;
    try {
      saveDraft(addLine(state.draft, selectedProduct, $("quantityInput").value, $("unitInput").value));
      $("quantityInput").value = "1";
      showToast("Producto agregado al pedido.");
    } catch (error) {
      showToast(error.message);
      $("quantityInput").focus();
    }
  };
  $("addButton").addEventListener("click", addSelected);
  $("quantityInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addSelected();
  });
  $("requestContent").addEventListener("change", (event) => {
    const quantity = event.target.closest("[data-line-quantity]");
    const unit = event.target.closest("[data-line-unit]");
    if (!quantity && !unit) return;
    const index = Number((quantity || unit).dataset[quantity ? "lineQuantity" : "lineUnit"]);
    try {
      const changes = quantity ? { quantity: quantity.value } : { unit: unit.value };
      saveDraft(updateLine(state.draft, index, changes));
    } catch (error) {
      showToast(error.message);
      renderOrder();
    }
  });
  $("requestContent").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-line]");
    if (!button) return;
    saveDraft(removeLine(state.draft, Number(button.dataset.removeLine)));
  });
  for (const [id, field] of [["managerInput", "manager"], ["phoneInput", "phone"], ["orderInput", "orderNumber"]]) {
    $(id).addEventListener("input", (event) => updateDraftField(field, event.target.value));
  }
  $("clearOrderButton").addEventListener("click", () => {
    if (!state.draft.lines.length) return;
    if (!window.confirm("¿Vaciar los productos de este pedido? Los datos del encargado y el número se conservarán.")) return;
    saveDraft({ ...state.draft, lines: [] });
    showToast("Pedido vacío.");
  });
  $("exportButton").addEventListener("click", downloadOrder);
  document.querySelectorAll("[data-mobile-view]").forEach((button) => {
    button.addEventListener("click", () => setMobileView(button.dataset.mobileView));
  });
}

async function restoreSavedState() {
  try {
    const saved = await readSavedState();
    const products = Array.isArray(saved.inventory?.products) ? saved.inventory.products : [];
    state.inventory = products;
    state.inventoryInfo = products.length && saved.inventory.info ? saved.inventory.info : null;
    const draft = normalizeDraft(saved.draft);
    state.draft = products.length ? reconcileDraft(draft, products) : draft;
    renderDepartments();
    renderAll();
    if (products.length) {
      const missing = countMissingLines(state.draft);
      if (missing) {
        showMessage(`${missing} productos guardados en el pedido ya no están en el inventario guardado. Revísalos antes de descargar.`, "info");
      } else {
        showMessage(`Inventario y pedido restaurados desde este dispositivo. Última actualización: ${inventoryDate(state.inventoryInfo?.loadedAt)}.`, "info");
      }
    }
  } catch (error) {
    renderAll();
    showMessage(`No se pudo abrir el almacenamiento local: ${error.message || "error de almacenamiento"}. Puedes usar la app en esta pestaña, pero importa un inventario y descarga tu pedido antes de cerrarla.`);
  }
}

function configureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    $("installButton").hidden = false;
  });
  $("installButton").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $("installButton").hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    $("installButton").hidden = true;
    showToast("App instalada en este dispositivo.");
  });
}

function updateConnectionStatus() {
  const status = $("connectionStatus");
  const offline = !navigator.onLine;
  status.classList.toggle("is-offline", offline);
  status.querySelector("span:last-child").textContent = offline ? "Sin conexión · modo local" : "En este dispositivo";
}

async function registerOfflineSupport() {
  if (window.location.protocol === "file:" || window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost") return;
  if (!("serviceWorker" in navigator)) {
    showMessage("Este navegador no permite activar el modo sin conexión. Puedes seguir usando la app mientras la página esté abierta.", "info");
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    showMessage("No se pudo activar el modo sin conexión en este navegador. La app y los datos guardados siguen disponibles mientras la página esté abierta.", "info");
  }
}

configureImportControls();
configureOrderControls();
configureInstallPrompt();
setMobileView("catalog");
updateConnectionStatus();
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
async function startApp() {
  await restoreSavedState();
  registerOfflineSupport();
}
startApp();
