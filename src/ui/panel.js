/**
 * Base Panel class for managing UI panels with custom event system
 */
export class Panel {
    constructor(elementId) {
        this.element =
            typeof elementId === 'string' ? document.getElementById(elementId) : elementId

        if (!this.element) {
            console.error(`Panel element not found: ${elementId}`)
        }

        // Event system
        this._eventListeners = {}
    }

    /**
     * Subscribe to an event
     * @param {string} eventName - Name of the event
     * @param {function} callback - Callback function to execute
     */
    on(eventName, callback) {
        if (!this._eventListeners[eventName]) {
            this._eventListeners[eventName] = []
        }
        this._eventListeners[eventName].push(callback)
    }

    /**
     * Unsubscribe from an event
     * @param {string} eventName - Name of the event
     * @param {function} callback - Callback function to remove
     */
    off(eventName, callback) {
        if (!this._eventListeners[eventName]) return

        this._eventListeners[eventName] = this._eventListeners[eventName].filter(
            (cb) => cb !== callback,
        )
    }

    /**
     * Emit an event with optional data
     * @param {string} eventName - Name of the event
     * @param {any} data - Data to pass to callbacks
     */
    emit(eventName, data) {
        if (!this._eventListeners[eventName]) return

        this._eventListeners[eventName].forEach((callback) => {
            try {
                callback(data)
            } catch (error) {
                console.error(`Error in event listener for ${eventName}:`, error)
            }
        })
    }

    show() {
        if (this.element) {
            this.element.classList.add('visible')
        }
    }

    hide() {
        if (this.element) {
            this.element.classList.remove('visible')
        }
    }

    toggle() {
        if (this.element) {
            this.element.classList.toggle('visible')
        }
    }

    /**
     * Initialize event listeners and callbacks
     * Subclasses should override this method
     */
    initialize() {
        // Override in subclass
    }
}
