# Portal de pedidos · COISA HOGAR

Aplicación local, adaptable a teléfono y computadora, para consultar el inventario exportado desde Stellar y preparar notas de pedido. La misma interfaz se puede instalar como aplicación web progresiva (PWA) en Android y iPhone/iPad.

## Uso diario

1. Pulsa **Actualizar desde repositorio** para cargar el XML central, o selecciona **Archivo XML** para usar un archivo de Stellar. También puedes arrastrar un XML al recuadro en una computadora.
2. La aplicación valida el archivo antes de guardarlo en el dispositivo. Si ya existe un inventario local, el botón de repositorio pide confirmación; al publicar un XML nuevo no se reemplazan automáticamente los datos guardados en el dispositivo.
3. Busca por código, descripción, marca o departamento; selecciona un producto, indica cantidad y unidad, y agrégalo al pedido. Para continuar un pedido existente, activa **Reposición desde Excel** antes de seleccionar el archivo.
4. Descarga el archivo `.xlsx` cuando termines. La primera hoja conserva el formato del ejemplo de Valencia —logo, encabezado, ubicación, tabla y cantidades con unidad— y la segunda hoja `Base de datos` incluye los códigos y las cantidades originales.

Los productos, el último inventario válido y el borrador se guardan en IndexedDB en el perfil local del navegador o de la aplicación de escritorio. Los cambios del pedido se guardan automáticamente. Cada dispositivo conserva sus propios datos; no existe sincronización entre teléfonos o computadoras.

## Actualizar el XML central

Reemplaza `public/INVENTARIO.xml` en el repositorio y publica los cambios. La nueva versión queda disponible en el sitio, pero los dispositivos que ya guardaron un inventario conservan su versión anterior hasta que confirmen una actualización.

El XML debe corresponder al reporte de Stellar `ReporteStellar` y contener registros `Registro` con código, descripción y estado activo. Los códigos de producto repetidos se rechazan para evitar pedidos ambiguos.

## Desarrollo web y PWA

Requiere Node.js y npm.

### Portal publicado

La versión web se publica automáticamente en [https://jorgealbertt.github.io/portal-inventario/](https://jorgealbertt.github.io/portal-inventario/) al subir cambios a GitHub. Abre ese enlace en el navegador del teléfono o la computadora para usar la aplicación.

El enlace publicado y el XML central son públicos. Los pedidos y los inventarios importados localmente permanecen en el dispositivo y no se sincronizan entre dispositivos.

```sh
npm install
npm run dev
```

Para validar la aplicación y generar los archivos estáticos:

```sh
npm test
npm run build
npm run preview
```

`npm run build` también crea `portal.html`, un archivo único que puedes abrir directamente en el navegador para cargar el inventario sin instalar herramientas adicionales en esa computadora. No incluye el XML central y no permite actualizarlo desde el repositorio.

### Instalar en teléfonos

La PWA se publica por HTTPS. **Android:** abre el enlace en Chrome y pulsa **Instalar app** cuando aparezca el botón dentro del portal. Si el navegador no ofrece la instalación automática, abre el menú ⋮ y elige **Instalar app** o **Agregar a pantalla principal**. **iPhone/iPad:** abre el enlace en Safari, pulsa **Instalar en iPhone/iPad** dentro del portal y sigue las instrucciones: **Compartir → Agregar a pantalla de inicio → Agregar**. iOS no descarga un instalador `.ipa`; añade la aplicación web a la pantalla de inicio.

En ambos sistemas, la primera visita requiere conexión para guardar la interfaz y el inventario inicial. Después, la app instalada puede abrirse sin conexión con los datos ya guardados. La instalación no sincroniza pedidos entre dispositivos.

## Aplicación de escritorio

Requiere Rust, las herramientas de compilación de Tauri 2 y los prerrequisitos nativos de Tauri de tu sistema operativo. En Linux se necesitan las bibliotecas GTK y WebKitGTK; Windows requiere las herramientas de C++ y WebView2.

```sh
npm run desktop:dev
npm run desktop:build
```

El comando de escritorio genera los iconos de plataforma desde el SVG incluido y después crea instaladores para Windows (`.msi`, `.nsis`) o Linux (`.deb`, `.rpm`, `.AppImage`) según el sistema anfitrión.

## Datos y atribución

**Derechos de la aplicación: JORGE ALBERTO PAREJO LANDINEZ.** La atribución se refiere a esta aplicación y no afirma titularidad sobre COISA HOGAR, Stellar, sus marcas, logotipos o los datos comerciales de terceros.
