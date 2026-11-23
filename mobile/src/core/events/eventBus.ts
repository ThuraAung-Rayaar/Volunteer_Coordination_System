/**
 * @format
 */

export type EventBusListener<T = any> = (data: T) => void;

export class AppEventBus {
  private listeners: Map<string, Set<EventBusListener>> = new Map();

  public on<T = any>(event: string, listener: EventBusListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  public emit<T = any>(event: string, data?: T): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(fn => {
        try {
          fn(data);
        } catch (e) {
          console.warn(`[AppEventBus] Error in listener for event ${event}:`, e);
        }
      });
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const appEventBus = new AppEventBus();

export const AppEvents = {
  EVENT_STATUS_CHANGED: 'event_status_changed',
  ASSIGNMENT_STATUS_CHANGED: 'assignment_status_changed',
  APPLICATION_STATUS_CHANGED: 'application_status_changed',
} as const;

export interface EventStatusChangedPayload {
  eventId: string;
  status: string;
}
