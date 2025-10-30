import { EventEmitter } from 'node:events';
import { WebhookEventType } from '@prisma/client';

export interface LedgerEventMessage {
  id: string;
  eventType: WebhookEventType;
  invoiceId?: string | null;
  paymentId?: string | null;
  createdAt: Date;
  payload: Record<string, unknown>;
}

const LEDGER_EVENT_TOPIC = 'ledgerEvent';

type EventBusEvents = {
  [LEDGER_EVENT_TOPIC]: (message: LedgerEventMessage) => void;
};

export class EventBus {
  private readonly emitter = new EventEmitter();

  publishLedgerEvent(message: LedgerEventMessage): void {
    this.emitter.emit(LEDGER_EVENT_TOPIC, message);
  }

  onLedgerEvent(listener: EventBusEvents[typeof LEDGER_EVENT_TOPIC]): void {
    this.emitter.on(LEDGER_EVENT_TOPIC, listener);
  }

  removeLedgerListener(listener: EventBusEvents[typeof LEDGER_EVENT_TOPIC]): void {
    this.emitter.off(LEDGER_EVENT_TOPIC, listener);
  }
}
