# PinGrab

Aplicación sencilla con frontend y backend Node.js. El backend consulta enlaces públicos de Pinterest y sirve los archivos desde el mismo dominio para evitar que el navegador tenga que hacer peticiones CORS directamente a Pinterest/CDN.

## Requisitos
- Node.js 20 o superior
- npm

## Ejecutar en tu computadora
1. Descomprime el proyecto.
2. Abre una terminal dentro de la carpeta `pingrab`.
3. Ejecuta `npm install`.
4. Ejecuta `npm start`.
5. Abre `http://localhost:3000`.

No necesitas configurar `BACKEND_URL`: frontend y backend se sirven desde el mismo servidor.

## Publicar en hosting
Necesitas un hosting que permita ejecutar una aplicación Node.js (no basta con subir el HTML a un hosting estático o PHP). Configura el comando de inicio `npm start` y usa el puerto que proporcione el hosting mediante la variable `PORT`.

## Limitaciones
Pinterest puede cambiar su estructura HTML, bloquear solicitudes automatizadas, pedir inicio de sesión o limitar temporalmente el acceso. En esos casos la app informa el error; no puede garantizarse disponibilidad permanente. Solo se detectan medios públicos que Pinterest exponga en la página. Respeta derechos de autor y condiciones de uso.
