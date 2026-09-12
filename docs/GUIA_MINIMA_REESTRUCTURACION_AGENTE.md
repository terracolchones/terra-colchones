# Terra — guía mínima para reestructurar el agente

Fecha: 12 de septiembre de 2026.

**Objetivo: proteger los comportamientos seguros, no congelar la estructura actual.**
Esta es la lectura mínima de estabilidad, junto con el AGENTS.md aplicable.
No es obligatorio leer todas las auditorías ni el contrato completo.

## 1. Punto de partida

- Servicio real: `agentevps / agente`, dominio `agente.terracolchonesymuebles.online`.
  El catálogo es otro servicio; no confundir sus versiones ni sus datos.
- Referencia histórica corregida: commit `bc55062`. Identificar la versión vigente
  antes de trabajar: no reemplazar mejoras posteriores por esa referencia antigua.
- Usar una rama de trabajo y un respaldo recuperable. Preservar cambios ajenos.

## 2. Protecciones esenciales

1. **Origen y canal:** validar autenticidad/firma y receptor autorizado antes de
   producir efectos. El multicanal es válido con aislamiento explícito por canal.
2. **Duplicados:** decidir de forma persistente y atómica si un evento ya fue
   procesado. Repetir el mismo evento no debe repetir acciones comerciales.
3. **Envíos:** distinguir preparación, intento, aceptación, persistencia y entrega.
   Un fallo local, timeout o reserva antigua no autoriza a repetir un envío aceptado
   o incierto. La recuperación necesita evidencia/reconciliación, no solo un reloj.
4. **HUMANO:** revalidar el modo antes de efectos automáticos y tras esperas
   relevantes. Conservar acceso claro a asesor, acuse acotado de transferencia
   y acciones manuales autorizadas. Una petición ya iniciada no puede retirarse.
5. **Pedidos, GPS y QR:** conservar asociación correcta con cliente/pedido y evitar
   despachos duplicados. Mantener el flujo comercial acordado salvo cambio explícito.
   El agente no aprueba pagos ni comprobantes automáticamente.
6. **Privacidad y diagnóstico:** distinguir intentos, aceptación, entrega y errores
   sin registrar secretos, conversaciones, teléfonos, coordenadas o archivos privados.
   No usar datos operativos ni credenciales reales para pruebas de desarrollo.

## 3. Libertad para rediseñar

Se pueden cambiar carpetas, funciones, módulos, framework, almacenamiento, colas,
adaptadores de proveedor, prompt y cantidad/formato de mensajes, dentro del alcance
autorizado. **No hay obligación de conservar los archivos, los dos mensajes de
bienvenida ni la implementación anterior.**

Las protecciones pueden reimplementarse o mejorarse. Una reestructuración ya
autorizada no requiere permiso adicional por cada movimiento interno de código;
sí debe conservar estas conductas y demostrarlo con pruebas. No heredar bugs
pendientes como requisitos. Conservar las fronteras de responsabilidad de los
servicios o documentar su redefinición si también forma parte del encargo.

## 4. Comprobación mínima antes de liberar

- Probar canal incorrecto, replay, envío aceptado seguido de fallo local, resultado
  incierto, cambio a HUMANO durante esperas y reservas pendientes antiguas.
- Comprobar pedido/GPS/QR, atención humana y ausencia de datos privados en logs.
- Mantener cobertura equivalente o mejor; no exigir exactamente 129 pruebas ni
  conservar tests ligados a una implementación sustituida. No eliminar aserciones
  de seguridad sin reemplazarlas por comprobaciones equivalentes.
- Ejecutar pruebas, tipos, lint y build correspondientes; revisar diff y reversión.
- Desplegar o modificar Meta/EasyPanel solo con autorización explícita. Antes de
  una prueba real, comprobar versión, cuenta, callback y suscripción `messages`.

## 5. Consulta puntual, no lectura de todo el historial

El [contrato técnico](CONTRATO_DE_ESTABILIDAD_DEL_AGENTE.md) queda como referencia:
sección 3 para una corrección concreta, 5 para pendientes y 8 para localizar pruebas.
Consultar únicamente el apartado relevante cuando haga falta contexto.

Estas reglas reducen regresiones técnicas. No prueban la causa de los baneos
anteriores ni garantizan que Meta no vuelva a restringir una cuenta.
