export enum NotificationType {
    Alert = 'alert',
    Success = 'success',
    Error = 'error',
    Warning = 'warning',
    Info = 'info',
}

export enum LogMethods{
    Console,
    Alert
}

/**
 * A single event notification entry.
 *
 * Note: despite the class name, this is now used to carry metadata for
 * Noty notifications (the rendering is handled by Noty).
 */
export class EventLogEntry {
    message: string;
    timestamp: number;
    notificationType: NotificationType;
    logMethod: LogMethods;

    constructor(message: string, notificationType: NotificationType = NotificationType.Info, logMethod: LogMethods = LogMethods.Console) {
        this.message = message;
        this.notificationType = notificationType;
        this.logMethod = logMethod;
        this.timestamp = performance.now();
    }
}
