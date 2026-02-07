import type { IncomingMessage, OutgoingMessage } from "../10-server/router.ts";

export class WebSocketRPC {
  #id = 0;
  #socket: WebSocket | null = null;
  #resolvers = new Map<
    number,
    {
      resolve: (response: Response) => void;
      reject: (error: unknown) => void;
      timeout: number;
    }
  >();
  #queue: IncomingMessage[] = [];

  // Reconnection state
  #reconnectAttempts = 0;
  #maxReconnectAttempts = 5;
  #reconnectDelay = 1000;
  #maxReconnectDelay = 30000;
  #reconnectTimer: number | null = null;
  #isReconnecting = false;
  #shouldReconnect = true;
  #requestTimeout = 30000;

  constructor(private url: string) {
    this.#connect();
  }

  pending() {
    return {
      outgoing: this.#queue,
      incoming: this.#resolvers,
    };
  }

  #connect() {
    if (
      this.#socket?.readyState === WebSocket.CONNECTING ||
      this.#socket?.readyState === WebSocket.OPEN
    ) {
      return;
    }

    try {
      this.#socket = new WebSocket(this.url);
      this.#setupEventHandlers();
    } catch (error) {
      console.error("[ws-rpc] Failed to create WebSocket:", error);
      this.#scheduleReconnect();
    }
  }

  #setupEventHandlers() {
    if (!this.#socket) return;

    this.#socket.onopen = () => {
      console.log("[ws-rpc] Connected");
      this.#reconnectAttempts = 0;
      this.#isReconnecting = false;
      this.#processQueue();
    };

    this.#socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as OutgoingMessage;
        this.#handleMessage(message);
      } catch (error) {
        console.error("[ws-rpc] Failed to parse message:", error);
      }
    };

    this.#socket.onclose = (event) => {
      console.log(
        `[ws-rpc] Connection closed: ${event.code} - ${event.reason}`,
      );
      this.#handleDisconnection();
    };

    this.#socket.onerror = (event) => {
      console.error("[ws-rpc] WebSocket error:", event);
    };
  }

  #handleMessage(message: OutgoingMessage) {
    if (message.id === 295) {
      console.log("[ws-rpc] Received message", message);
    }
    const resolver = this.#resolvers.get(message.id);
    if (!resolver) {
      console.warn(`[ws-rpc] No resolver found for message ${message.id}`);
      return;
    }

    this.#resolvers.delete(message.id);
    clearTimeout(resolver.timeout);

    switch (message.type) {
      case "response": {
        resolver.resolve(
          new Response(message.body, {
            status: message.status,
            headers: message.headers,
          }),
        );
        break;
      }

      case "surprise": {
        resolver.reject(new Error(message.surprise));
        break;
      }

      case "ping":
      case "pong": {
        // Ping/pong messages are handled by the transport layer,
        // but if they arrive here, we ignore them for this resolver
        break;
      }

      default: {
        // Exhaustiveness check - message should be 'never' here
        const exhaustiveCheck: never = message;
        resolver.reject(
          new Error(
            `Invalid message type: ${(exhaustiveCheck as { type: string }).type}`,
          ),
        );
        break;
      }
    }
  }

  #processQueue() {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const queueToProcess = [...this.#queue];
    this.#queue = [];

    for (const message of queueToProcess) {
      try {
        if (this.#socket.readyState === WebSocket.OPEN) {
          this.#socket.send(JSON.stringify(message));
          if (message.id === 295) {
            console.log("[ws-rpc] Sent message", message);
          }
        } else {
          this.#queue.unshift(message);
          break;
        }
      } catch (error) {
        console.error("[ws-rpc] Failed to send queued message:", error);
        this.#queue.unshift(message);
        break;
      }
    }
  }

  #handleDisconnection() {
    this.#socket = null;

    if (this.#shouldReconnect && !this.#isReconnecting) {
      this.#scheduleReconnect();
    } else {
      this.#rejectAllPending("Connection closed and not reconnecting");
    }
  }

  #scheduleReconnect() {
    if (!this.#shouldReconnect || this.#isReconnecting) return;

    if (this.#reconnectAttempts >= this.#maxReconnectAttempts) {
      console.error("[ws-rpc] Max reconnection attempts reached");
      this.#rejectAllPending("Max reconnection attempts exceeded");
      return;
    }

    this.#isReconnecting = true;
    this.#reconnectAttempts++;

    const delay = Math.min(
      this.#reconnectDelay * Math.pow(2, this.#reconnectAttempts - 1) +
        Math.random() * 1000,
      this.#maxReconnectDelay,
    );

    console.log(
      `[ws-rpc] Reconnecting in ${Math.round(
        delay,
      )}ms (attempt ${this.#reconnectAttempts})`,
    );

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, delay);
  }

  #rejectAllPending(reason: string) {
    this.#resolvers.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error(reason));
    });
    this.#resolvers.clear();
  }

  // Public API
  request(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const id = this.#id++;
      const message: IncomingMessage = {
        id,
        type: "request",
        url,
        ...options,
      };

      const timeout = setTimeout(() => {
        if (this.#resolvers.has(id)) {
          this.#resolvers.delete(id);
          reject(
            new Error(
              `Request ${id} timed out after ${this.#requestTimeout}ms`,
            ),
          );
        }
      }, this.#requestTimeout);

      this.#resolvers.set(id, { resolve, reject, timeout });

      if (this.#socket?.readyState === WebSocket.OPEN) {
        try {
          this.#socket.send(JSON.stringify(message));
          if (message.id === 295) {
            console.log("[ws-rpc] Sent message (2)", message);
          }
        } catch (error) {
          this.#queue.push(message);
        }
      } else {
        this.#queue.push(message);

        if (!this.#socket || this.#socket.readyState === WebSocket.CLOSED) {
          this.#connect();
        }
      }
    });
  }

  reconnect() {
    this.#shouldReconnect = true;
    this.#reconnectAttempts = 0;

    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }

    this.#isReconnecting = false;

    if (this.#socket) {
      this.#socket.close();
    }

    this.#connect();
  }

  disconnect() {
    this.#shouldReconnect = false;

    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }

    if (this.#socket) {
      this.#socket.close(1000, "Client disconnect");
    }

    this.#rejectAllPending("Client disconnected");
    this.#queue = [];
  }

  get isConnected(): boolean {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  get isConnecting(): boolean {
    return (
      this.#socket?.readyState === WebSocket.CONNECTING || this.#isReconnecting
    );
  }
}
