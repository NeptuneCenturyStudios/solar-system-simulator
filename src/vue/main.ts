import { createApp } from 'vue';

import App from './App.vue';
import { initSimBridge } from './sim-bridge';

// Styles are currently linked through the HTML <link> tags. Once the old UI is gone, styles
// will be imported directly into the Vue application.

/**
 * Mounts the Vue UI overlay. Called from index.ts after the simulation UI has
 * been initialised, so the bridge can register real sim hooks immediately.
 */
export function mountVueUi(): void {
    const host = document.getElementById('vue-ui-root');
    if (!host) {
        console.warn('[vue-ui] #vue-ui-root not found; Vue UI not mounted.');
        return;
    }
    if (host.dataset.vueMounted === 'true') {
        console.warn('[vue-ui] Vue UI already mounted; skipping duplicate mount.');
        return;
    }

    initSimBridge();

    const app = createApp(App);
    app.mount(host);
    host.dataset.vueMounted = 'true';
}
