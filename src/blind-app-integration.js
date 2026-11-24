function configureBlindOrderControls() {
  const familyInput = $("blindFamily");
  const sizeField = $("blindSizeField");
  const colorInput = $("blindColor");
  const form = $("blindOrderForm");

  const updateBlindOptions = () => {
    const selected = BLIND_OPTIONS.find((option) => option.family === familyInput.value) || BLIND_OPTIONS[0];
    sizeField.hidden = selected.sizes.length === 0;
    $("blindSize").required = selected.sizes.length > 0;
    colorInput.replaceChildren(...selected.colors.map((color) =>
      new Option(`${color.name} · ${color.code}`, color.code)
    ));
    $("blindOrderHint").textContent = selected.sizes.length
      ? `BKFF está disponible en ${selected.sizes.join(" y ")} cm. Elige el color y su código.`
      : `El pedido ${selected.label} se identificará por su color y código.`;
  };

  familyInput.addEventListener("change", updateBlindOptions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const product = createBlindProduct(
        familyInput.value,
        $("blindSize").value,
        colorInput.value
      );
      saveDraft(addLine(state.draft, product, $("blindQuantity").value, "UND"));
      $("blindQuantity").value = "1";
      showToast(`${product.item} · ${product.shortDescription} agregado al pedido.`);
    } catch (error) {
      showToast(error.message || "No se pudo agregar la persiana.");
    }
  });

  updateBlindOptions();
}
