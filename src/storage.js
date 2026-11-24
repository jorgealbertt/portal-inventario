const DATABASE_NAME = "coisa-hogar-portal";
const DATABASE_VERSION = 1;
const INVENTORY_KEY = "current";
const DRAFT_KEY = "current";

function openDatabase() {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("Este navegador no permite guardar datos localmente."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("inventory")) {
        database.createObjectStore("inventory");
      }
      if (!database.objectStoreNames.contains("draft")) {
        database.createObjectStore("draft");
      }
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

function runTransaction(database, storeNames, mode, executor) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error || new Error("Error en la transacción local."));
      }
    };
    const succeed = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const transaction = database.transaction(storeNames, mode);
      transaction.onabort = () => fail(transaction.error || new Error("Se canceló la operación de guardado local."));
      transaction.onerror = () => fail(transaction.error || new Error("No se pudieron guardar los cambios."));
      executor(transaction, succeed, fail);
      if (mode === "readwrite") {
        transaction.oncomplete = () => succeed();
      }
    } catch (error) {
      fail(error);
    }
  });
}

export async function readSavedState() {
  const database = await openDatabase();
  try {
    return await runTransaction(database, ["inventory", "draft"], "readonly", async (transaction, succeed, fail) => {
      try {
        const inventoryRequest = transaction.objectStore("inventory").get(INVENTORY_KEY);
        const draftRequest = transaction.objectStore("draft").get(DRAFT_KEY);
        const [inventory, draft] = await Promise.all([
          requestResult(inventoryRequest),
          requestResult(draftRequest)
        ]);
        succeed({ inventory: inventory || null, draft: draft || null });
      } catch (error) {
        fail(error);
      }
    });
  } finally {
    database.close();
  }
}

export async function writeSavedState(state) {
  const database = await openDatabase();
  try {
    await runTransaction(database, ["inventory", "draft"], "readwrite", (transaction) => {
      transaction.objectStore("inventory").put(state.inventory, INVENTORY_KEY);
      transaction.objectStore("draft").put(state.draft, DRAFT_KEY);
    });
  } finally {
    database.close();
  }
}

export async function writeDraft(draft) {
  const database = await openDatabase();
  try {
    await runTransaction(database, ["draft"], "readwrite", (transaction) => {
      transaction.objectStore("draft").put(draft, DRAFT_KEY);
    });
  } finally {
    database.close();
  }
}