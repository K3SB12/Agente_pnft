# Agente_pnft
# Guía rápida — Agente Soldado IA + n8n (Mi AL_IA_DA)

## 1) Archivos
Sube estos archivos al repositorio `Agente_pnft`:
- index.html
- style.css
- app.js
- pnft-data.js  <-- reemplaza con tu pnft-datos-js.js completo
- manifest.json
- sw.js

Publica con GitHub Pages (branch `main` -> Settings -> Pages -> select root).

## 2) Preparar n8n (opcional pero recomendado)
Opciones:
- n8n.cloud (plan gratuito limitado) — crea cuenta y copia URL del webhook.
- n8n Desktop (local) — instala y crea workflow.

Importa `n8n_workflow.json` en n8n. Ajusta el nodo OpenAI o HTTP Request:
- Proporciona tu API key en n8n Credentials (no en el frontend).
- Asegúrate de que el Webhook tenga path y esté activo. Copia la URL completa.

## 3) Conectar frontend con n8n
En la app (index.html) pega la URL del webhook y haz clic en "Guardar webhook".

## 4) Uso por docentes (pasos)
1. Abrir la PWA en el celular / navegador.
2. Seleccionar nivel (ej.: 3°).
3. Seleccionar hasta 4 áreas (ej.: Programación y Algoritmos + Ciencia de datos...).
4. Marcar saberes deseados.
5. Escribir RDA si desea.
6. Seleccionar Modo: "Soldado IA" para usar n8n/LLM, o "Local" para fallback.
7. Presionar "Generar Planeamiento".
8. Si el webhook falla, la petición se guarda en cola y se reintentará cuando vuelva la conexión.

## 5) Cómo funciona internamente
- **Frontend** arma un `payload` con `nivel`, `areas` (y sus saberes) y `rda`.
- Si está en modo Soldado y hay webhook configurado -> manda payload a n8n.
- n8n invoca LLM (OpenAI u otro) y devuelve `textoGenerado`.
- Si la petición falla (offline o error) -> el frontend guarda el payload en localStorage (cola).
- Cuando el usuario vuelva online, el frontend reintenta enviar la cola automáticamente.

## 6) Seguridad y privacidad
- Nunca pongas claves OpenAI en el frontend.
- Coloca claves en n8n (credenciales seguras) o en tu backend.
- Si guardas datos sensibles, revisa las políticas del centro educativo (MEP).

## 7) Mejoras posibles (futuro)
- Generar Word (.docx) con formato (requiere backend o librería JS del lado cliente).
- Interfaz para editar texto generado (WYSIWYG).
- Integración con Google Drive / MEP intranet para guardar archivos.
- Trazabilidad: registro de quién generó, cuándo y con qué acciones.

## 8) Soporte
Si querés, reviso tu repo y hago los ajustes (colores, export a PDF, plantilla DOCX) — decime "Revisalo" y doy instrucciones concretas.
