import { EventEmitter } from 'node:events';
import { Response } from 'express';

export interface SystemEvent {
  id: string;
  projectId: string;
  type: string;
  payload: Record<string, any>;
  timestamp: string;
}

class EventBus extends EventEmitter {
  private clients: Map<string, Set<Response>> = new Map();

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  addClient(projectId: string, res: Response) {
    if (!this.clients.has(projectId)) {
      this.clients.set(projectId, new Set());
    }
    this.clients.get(projectId)!.add(res);

    res.on('close', () => {
      const set = this.clients.get(projectId);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          this.clients.delete(projectId);
        }
      }
    });
  }

  broadcast(event: SystemEvent) {
    this.emit('event', event);

    const clientSet = this.clients.get(event.projectId);
    if (!clientSet || clientSet.size === 0) return;

    const data = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of clientSet) {
      try {
        res.write(data);
      } catch (err) {
        // Socket closed
      }
    }
  }
}

export const eventBus = new EventBus();
