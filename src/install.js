export function getInstallPlatform(userAgent = "", platform = "", maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function configureInstallPrompt() {
  const button = document.getElementById("installButton");
  const dialog = document.getElementById("installGuide");
  const title = document.getElementById("installGuideTitle");
  const intro = document.getElementById("installGuideIntro");
  const steps = document.getElementById("installGuideSteps");
  const closeButton = document.getElementById("closeInstallGuide");
  if (!button) return;

  const platform = getInstallPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  let installPrompt = null;
  const isInstalled = navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches;

  if (isInstalled) {
    button.hidden = true;
    return;
  }

  if (platform === "ios" || platform === "android") {
    button.hidden = false;
    button.textContent = platform === "ios" ? "Instalar en iPhone/iPad" : "Instalar app";
    button.setAttribute("aria-label", platform === "ios"
      ? "Cómo instalar la app en iPhone o iPad"
      : "Instalar la app en Android");
  }

  const showGuide = () => {
    if (!dialog || !title || !intro || !steps) return;
    const instructions = platform === "ios"
      ? {
          title: "Instalar en iPhone o iPad",
          intro: "Abre este portal en Safari y sigue estos pasos para agregarlo a tu pantalla de inicio:",
          steps: [
            "Toca Compartir (el cuadrado con la flecha hacia arriba).",
            "Desplázate por las opciones y toca Agregar a pantalla de inicio.",
            "Toca Agregar para confirmar. Encontrarás la app junto a tus otras aplicaciones."
          ]
        }
      : {
          title: "Instalar en Android",
          intro: "Si no aparece la ventana automática de instalación, usa el menú del navegador:",
          steps: [
            "En Chrome, toca el menú ⋮ de la esquina superior.",
            "Elige Instalar app o Agregar a pantalla principal.",
            "Confirma la instalación. El nombre de la opción puede variar según el navegador."
          ]
        };
    title.textContent = instructions.title;
    intro.textContent = instructions.intro;
    steps.replaceChildren(...instructions.steps.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }));
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  closeButton?.addEventListener("click", () => dialog?.close());
  button.addEventListener("click", async () => {
    if (installPrompt) {
      const promptEvent = installPrompt;
      installPrompt = null;
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === "accepted") {
          button.hidden = true;
          return;
        }
      } catch {
        // If the browser prompt is unavailable, show platform-specific install steps.
      }
    }
    if (platform === "ios" || platform === "android") showGuide();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    button.textContent = "Instalar app";
    button.setAttribute("aria-label", "Instalar la aplicación en este dispositivo");
    button.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.hidden = true;
    showInstallToast();
  });
}

function showInstallToast() {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = "App instalada en este dispositivo.";
  toast.classList.add("is-visible");
  setTimeout(() => toast.classList.remove("is-visible"), 2800);
}
