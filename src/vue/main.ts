import { createApp } from 'vue';

import App from './App.vue';
import { initSimBridge } from './sim-bridge';
import './style.css';

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
