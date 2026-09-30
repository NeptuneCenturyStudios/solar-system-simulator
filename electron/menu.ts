/**
 * Application menu setup.
 *
 * The simulator owns the keyboard (WASD flight controls, single-key toggles),
 * so a menu bar mostly gets in the way. Production builds therefore run
 * menuless on Windows and Linux, while macOS always keeps its app menu because
 * standard system shortcuts like Cmd+Q and Cmd+H are delivered through it.
 * Development builds get a small menu exposing reload and devtools.
 */

import { Menu, type MenuItemConstructorOptions } from 'electron';

/** Apply the menu policy for the current platform and build kind. */
export function installApplicationMenu(isDevelopment: boolean): void {
    if (process.platform === 'darwin') {
        Menu.setApplicationMenu(buildMacMenu(isDevelopment));
        return;
    }

    Menu.setApplicationMenu(isDevelopment ? buildDevelopmentMenu() : null);
}

/** macOS requires an app menu for standard shortcuts; the view menu is dev-only. */
function buildMacMenu(isDevelopment: boolean): Menu {
    const template: MenuItemConstructorOptions[] = [{ role: 'appMenu' }];
    if (isDevelopment) template.push(buildViewMenu());
    template.push({ role: 'windowMenu' });
    return Menu.buildFromTemplate(template);
}

function buildDevelopmentMenu(): Menu {
    return Menu.buildFromTemplate([
        buildViewMenu(),
        { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    ]);
}

function buildViewMenu(): MenuItemConstructorOptions {
    return {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
        ],
    };
}
