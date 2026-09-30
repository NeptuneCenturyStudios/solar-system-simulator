/**
 * Content types for the files the `app://` handler serves.
 *
 * Chromium's own file loader only recognises common web extensions, and the
 * bundle contains model and audio formats it does not know about. Serving an
 * explicit type keeps `<img>` and `<audio>` decoding predictable and makes the
 * model loaders' responses self-describing.
 */

import * as path from 'node:path';

const DEFAULT_MIME_TYPE = 'application/octet-stream';

const MIME_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
    // Documents and scripts
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',

    // Raster images (planet and skydome textures)
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',

    // Fonts
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',

    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',

    // 3D models (OBJ/MTL are plain text; GLTF has a JSON and a binary form)
    '.obj': 'text/plain; charset=utf-8',
    '.mtl': 'text/plain; charset=utf-8',
    '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary',
    '.fbx': 'application/octet-stream',
    '.bin': 'application/octet-stream',
    '.wasm': 'application/wasm',
};

/** Content type for `filePath`, falling back to a generic binary type. */
export function mimeTypeForPath(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    return MIME_TYPE_BY_EXTENSION[extension] ?? DEFAULT_MIME_TYPE;
}
