const DATABASE_NAME = "coisa-hogar-portal";
const DATABASE_VERSION = 1;
const INVENTORY_KEY = "current";
const DRAFT_KEY = "current";

function openDatabase() {
  if (!("indexedDB" in globalThis)) return Promise.reject(new Error("Este navegador no permite guardar datos localmente."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("inventory")) database.createObjectStore("inventory");
      if (!database.objectStoreNames.contains("draft")) database.createObjectStore("draft");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local."));
    request.onblocked = () => reject(new Error("Cierra otra pestaña de esta app para completar la actualización local."));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudieron leer los datos guardados."));
  });
}

export async function readSavedState() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(["inventory", "draft"], "readonly");
    const inventoryRequest = transaction.objectStore("inventory").get(INVENTORY_KEY);
    const draftRequest = transaction.objectStore("draft").get(DRAFT_KEY);
    const [inventory, draft] = await Promise.all([requestResult(inventoryRequest), requestResult(draftRequest)]);
    return { inventory: inventory || null, draft: draft || null };
  } finally {
    database.close();
  }
}

export async function writeSavedState(state) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(["inventory", "draft"], "readwrite");
      transaction.objectStore("inventory").put(state.inventory, INVENTORY_KEY);
      transaction.objectStore("draft").put(state.draft, DRAFT_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("No se pudieron guardar los cambios."));
      transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado local."));
    });
  } finally {
    database.close();
  }
}

export async function writeDraft(draft) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(["draft"], "readwrite");
      transaction.objectStore("draft").put(draft, DRAFT_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el pedido."));
      transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado del pedido."));
    });
  } finally {
    database.close();
  }
}
