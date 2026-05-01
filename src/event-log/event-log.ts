export class EventLogEntry {
    message: string;
    timestamp: number;

    constructor(message: string) {
        this.message = message;
        this.timestamp = performance.now();
    }
}
