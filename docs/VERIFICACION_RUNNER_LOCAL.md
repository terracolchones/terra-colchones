# Verificación del código de salida de pruebas locales

Fecha: 12 de septiembre de 2026.

El proceso hijo revisa explícitamente el estado final de los módulos de Vitest y
los errores no manejados. Si no hubo módulos, alguno falló o quedó incompleto, o
hubo errores no manejados, conserva o establece una salida distinta de cero.
Nunca sustituye un código de error anterior por cero. El proceso padre propaga
el estado del hijo y considera un proceso terminado sin estado como un fallo.

Se verificó con un archivo temporal exclusivamente sintético
`src/test/local-runner-exit-probe.test.ts`, creado y eliminado durante la prueba.
El comando utilizado en cada variante fue:

```powershell
node scripts/run-local-tests.mjs src/test/local-runner-exit-probe.test.ts
```

| Variante de prueba | Resultado comprobado |
| --- | --- |
| Aserción deliberadamente fallida, antes del cambio | Salida 1 |
| Aserción deliberadamente fallida, comprobación explícita añadida | Salida 1 |
| Aserción correcta | Salida 0 |
| Excepción al cargar el archivo | Salida 1 |
| Prueba correcta con rechazo de promesa no manejado | Salida 1 |
| Filtro del archivo después de eliminarlo: ningún test encontrado | Salida 1 |

El supuesto resultado cero ante una aserción fallida no se reprodujo con un
comando aislado. Esta modificación hace explícita la condición de aprobación;
no se presenta como reproducción de un fallo que no fue observado.

Al ejecutar desde PowerShell, comprobar `$LASTEXITCODE` inmediatamente después
del comando de pruebas. Otro comando posterior puede sustituirlo. Los resultados
anteriores se observaron en ejecuciones separadas y no se dedujeron solo del
texto «passed» o «failed» impreso por Vitest.

La verificación mantuvo el bloqueo de red y los adaptadores de datos sintéticos.
No leyó bases operativas, archivos de credenciales ni conversaciones reales.
El archivo temporal de prueba ya no existe y no forma parte de los cambios.
