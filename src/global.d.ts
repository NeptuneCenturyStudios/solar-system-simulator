declare module '*.css' {
    const content: string;
    export default content;
}

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent;
    export default component;
}

/**
 * High-resolution body-texture manifest, generated at build time by
 * `vite-plugin-texture-manifest.ts`. Each array holds the body-relative paths
 * (e.g. `earth_day.jpg`, `procedural/terrestrial-7.jpg`) for which a texture
 * exists in that quality tier. Consumed by `src/drawing/texture-quality.ts`.
 */
declare module 'virtual:texture-quality-manifest' {
    /** Folder-relative paths present in `assets/textures/bodies/8k`. */
    export const eightKTextures: string[];
    /** Folder-relative paths present in `assets/textures/bodies/4k`. */
    export const fourKTextures: string[];
}

/**
 * @jamescoyle/vue-icon ships a bare `.vue` file as its entry point with no
 * typings, so the `*.vue` wildcard above doesn't cover the package name.
 */
declare module '@jamescoyle/vue-icon' {
    import type { DefineComponent } from 'vue';
    const SvgIcon: DefineComponent<{
        /** Icon preset that supplies the default size and viewBox. */
        type?: 'mdi' | 'simple-icons';
        /** SVG path data, e.g. an export from `@mdi/js`. */
        path: string;
        size?: string | number;
        viewbox?: string;
        flip?: 'horizontal' | 'vertical' | 'both' | 'none';
        rotate?: number;
    }>;
    export default SvgIcon;
}

/**
 * Shape of the bridge the Electron preload script installs on `window`.
 *
 * Kept in sync by hand with `electron/preload.ts`, which is compiled
 * separately from the renderer and therefore cannot share this declaration.
 */
interface IDesktopEnvironment {
    /** True when running inside the desktop app rather than a browser tab. */
    readonly isElectron: true;
    /** Node's platform id, e.g. 'win32', 'darwin', 'linux'. */
    readonly platform: string;
    /** Electron runtime version. */
    readonly electronVersion: string;
}

interface Window {
    /**
     * Desktop bridge, or `undefined` in a browser. Feature detection should
     * test this rather than the user agent.
     */
    readonly desktop?: IDesktopEnvironment;
}
