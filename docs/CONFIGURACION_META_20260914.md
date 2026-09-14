# Configuración de Meta y páginas informativas — 14/09/2026

## Alcance y punto recuperable

- Solicitud: completar los datos aplicables de Meta y crear las páginas necesarias.
- Base del catálogo: `0e02bebbf7cc6c1f3759de1a0843f189fee6fbe9` (`main`).
- Trabajo aislado: `codex/meta-legal-pages-20260914`.
- Respaldo previo: `codex/safety-meta-pages-20260914`.
- No se modifica el agente, usuarios del sistema, credenciales, pagos ni bases de datos.

## Estado observado antes de publicar

- Meta básica: dominio `terracolchonesymuebles.online` y categoría Compras guardados y comprobados tras recargar.
- Privacidad: reemplazado el antiguo túnel por `https://terracolchonesymuebles.online/privacy`.
- Eliminación: apunta temporalmente a esa misma página existente, que contiene instrucciones para solicitarla por WhatsApp.
- El correo de contacto existente se conserva. La lectura automatizada no lo devuelve; la captura visual confirma que está presente. No deducir que está vacío a partir de la lectura automatizada.
- Términos: todavía conserva el enlace incorrecto a Facebook. No enlazar `/terms` hasta publicarla y verificar respuesta y contenido.
- Icono: Meta rechazó el JPG existente por fondo blanco. El usuario cargó después una versión transparente; se verificó la aparición de «Reemplazar ícono de la app», que confirma el icono cargado.
- Avanzada: revisada, sin cambios. Se conservan v26.0, modo no nativo/de escritorio y acceso API a configuración desactivado. No habilitar permisos, restricciones o direcciones de retorno sin una función real que los necesite.
- Verificación del negocio: En revisión. No se inició Access Verification/Tech Provider.

## Páginas preparadas, todavía no publicadas

- `/privacy`: amplía datos tratados y explica IA, pedidos, ubicación y comprobantes.
- `/terms`: condiciones de uso del catálogo/asistente, sin inventar condiciones de compraventa, garantías ni devoluciones.
- `/data-deletion`: solicitud manual; no promete borrado automático ni eliminación completa al borrar un chat.
- El titular autorizó `automatizacionterra@gmail.com` como correo público para recibir y atender solicitudes de privacidad y eliminación. Se incorpora como enlace de correo en las tres páginas, junto al WhatsApp anunciado en el catálogo.
- El usuario confirmó el canal para recibir y atender las solicitudes y autorizó publicar las páginas con este procedimiento manual. No se ha implementado un sistema de supresión integral.
- Los plazos de retención y las condiciones comerciales no están definidos en los documentos comprobados. No se han inventado.

## Acceso y publicación autorizada

- Git no tiene autenticación de escritura en esta PC; la simulación de push falló por falta de usuario.
- Los seis archivos del cambio quedaron preparados en el área de Git. El commit local no se pudo crear porque esta sesión no tiene identidad de autor configurada. No se cambió la configuración global de Git.
- El usuario completó el acceso a GitHub. La sesión del navegador muestra la cuenta propietaria y los controles para editar/añadir archivos. Esto no configura automáticamente la autenticación de Git en el terminal.
- La versión `main` consultada en el navegador coincide con la base de esta tarea. El usuario autorizó subir los seis archivos al catálogo y actualizar después los enlaces en Meta.
- La preparación se realiza mediante la sesión web propietaria, en la rama de trabajo, sin generar claves nuevas. GitHub ya confirmó el guardado de archivos en esa rama. No confundir ese guardado con el despliegue del catálogo.
- Nunca copiar secretos de EasyPanel para sortear la falta de autenticación.

## Validación local

- 35 pruebas aprobadas en 8 archivos, incluidas 5 nuevas para las páginas informativas.
- TypeScript sin errores.
- Lint sin errores.
- Build de Next.js 16.3.4 completado: las tres páginas se generan como contenido estático, sin credenciales ni llamadas a IA.
- `git diff --check` sin errores de espacios (solo aviso de conversión LF/CRLF).
- Vista previa actual con el correo autorizado: `http://127.0.0.1:3016/privacy`.
- Navegación comprobada en navegador: privacidad, condiciones, eliminación, regreso a privacidad y catálogo. El catálogo local muestra su estado vacío esperado, porque esta copia no contiene las credenciales de producción.
- Diseño de escritorio inspeccionado visualmente. En ancho reducido no se detectó desbordamiento horizontal; la captura móvil presentó un recorte/fallo de la herramienta y no se considera una validación visual completa. Se restableció el tamaño del navegador.
- Tras incorporar el correo autorizado, se repitieron las 35 pruebas, lint, TypeScript y build con resultado satisfactorio. Se comprobó en navegador el correo y el destino `mailto:` en privacidad, condiciones y eliminación, incluida la navegación de vuelta a privacidad; sin errores de consola observados.
- La comprobación de eliminación con emulación de 390 píxeles devolvió ancho de página y contenido de 390 píxeles. La captura de pantalla alternativa falló; no se presenta como revisión visual móvil completa. Se retiró la emulación al terminar.
- El ZIP entregado anteriormente corresponde al estado previo a la confirmación del correo; no contiene esta última actualización. Los archivos actuales del proyecto son la fuente para publicar.

## Verificación pendiente

Completar la captura visual móvil y, solo tras publicación autorizada, registrar URLs públicas y cambios finales de Meta. No declarar terminado el despliegue a partir de un build local.

## Fuentes de configuración

- https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings/
- https://developers.facebook.com/docs/development/create-an-app/app-dashboard/advanced-settings/
- https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions
- https://developers.facebook.com/docs/development/release/access-verification/

Tech Provider corresponde al acceso a activos de otros negocios. El asistente propio de Terra no requiere convertirse en proveedor de tecnología por utilizar IA. El segundo video de YouTube no se pudo revisar completo por la comprobación de acceso; no se presenta como evidencia de revisión punto por punto.
