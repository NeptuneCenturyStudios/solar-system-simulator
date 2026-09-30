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
