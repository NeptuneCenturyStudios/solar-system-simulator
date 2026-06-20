/**
 * Base Panel class for managing UI panels with custom event system
 */
export class Panel {
    element: HTMLElement | null;
    private _eventListeners: { [key: string]: Array<(data?: unknown) => void> };

    constructor(elementId: string | HTMLElement) {
        this.element =
            typeof elementId === 'string' ? document.getElementById(elementId) : elementId;

        if (!this.element) {
            console.error(`Panel element not found: ${elementId}`);
        }

        // Event system
        this._eventListeners = {};
    }

    /**
     * Subscribe to an event
     * @param {string} eventName - Name of the event
     * @param {function} callback - Callback function to execute
     */
    on<T = unknown>(eventName: string, callback: (data: T) => void) {
        if (!this._eventListeners[eventName]) {
            this._eventListeners[eventName] = [];
        }
        this._eventListeners[eventName].push(callback as (data?: unknown) => void);
    }

    /**
     * Unsubscribe from an event
     * @param {string} eventName - Name of the event
     * @param {function} callback - Callback function to remove
     */
    off<T = unknown>(eventName: string, callback: (data: T) => void) {
        if (!this._eventListeners[eventName]) return;

        this._eventListeners[eventName] = this._eventListeners[eventName].filter(
            (cb) => cb !== (callback as (data?: unknown) => void)
        );
    }

    /**
     * Emit an event with optional data
     * @param {string} eventName - Name of the event
     * @param {any} data - Data to pass to callbacks
     */
    emit<T = unknown>(eventName: string, data?: T) {
        if (!this._eventListeners[eventName]) return;

        this._eventListeners[eventName].forEach((callback) => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${eventName}:`, error);
            }
        });
    }

    show() {
        if (this.element) {
            this.element.classList.add('visible');
        }
    }

    hide() {
        if (this.element) {
            this.element.classList.remove('visible');
            this.emit('closed');
        }
    }

    toggle() {
        if (this.element) {
            this.element.classList.toggle('visible');
        }

        // Return the current visibility state after toggling
        return this.element?.classList.contains('visible') || false;
    }

    /**
     * Initialize event listeners and callbacks
     * Subclasses should override this method
     */
    initialize() {
        // Override in subclass
    }
}
