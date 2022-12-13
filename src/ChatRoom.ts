import type { AuthUser, Socket } from "../types/common.d.ts";
import type { Chat, ChatMessage, ChatRoom, ChatRoomConnectOptions, ChatRoomOptions } from "../types/ChatRoom.d.ts";
import { checkNamespace, dec } from "./common/utils.ts";
import { connect, SocketStatus } from "./common/socket.ts";

enum MessageFlag {
  CHAT = 1,
  MESSAGE = 2,
  EVENT = 3,
}

class Channel<T> {
  #queue: T[] = [];
  #resolvers: Array<(value: { value: T; done: false }) => void> = [];

  [Symbol.asyncIterator]() {
    return this;
  }

  next() {
    return new Promise<{ value: T; done: false }>((resolve) => {
      const value = this.#queue.shift();
      if (value !== undefined) {
        resolve({ value, done: false });
      } else {
        this.#resolvers.push(resolve);
      }
    });
  }

  push(value: T) {
    const callback = this.#resolvers.shift();
    if (callback) {
      callback({ value, done: false });
    } else {
      this.#queue.push(value);
    }
  }
}

class ChatImpl<U extends AuthUser> implements Chat<U> {
  #channel: Channel<ChatMessage<U>>;
  #onlineUsers: Map<string, U>;
  #socket: Socket;
  #listeners: Map<string, Set<(event: unknown) => void>> = new Map();
  #lastMessageId: string | null = null;

  constructor(socket: Socket, history: ChatMessage<U>[], onlineUsers: U[]) {
    this.#channel = new Channel();
    this.#socket = socket;
    this.#onlineUsers = new Map(onlineUsers.map((user) => [user.uid, user] as [string, U]));
    for (const message of history) {
      this.$pushMessage(message);
    }
    this.on("userjoin", ({ user }) => {
      this.#onlineUsers.delete(user.uid);
      this.#onlineUsers.set(user.uid, user);
    });
    this.on("userleave", ({ user }) => {
      this.#onlineUsers.delete(user.uid);
    });
  }

  get $listeners() {
    return this.#listeners;
  }

  get $lastMessageId() {
    return this.#lastMessageId;
  }

  $setOnlineUsers(users: U[]) {
    this.#onlineUsers = new Map(users.map((user) => [user.uid, user] as [string, U]));
  }

  $pushMessage(msg: ChatMessage<U>) {
    this.#channel.push(msg);
    this.#lastMessageId = msg.id;
  }

  get channel() {
    return this.#channel;
  }

  get onlineUsers(): U[] {
    return [...this.#onlineUsers.values()].map((user) => ({ ...user }));
  }

  pullHistory(_n?: number): Promise<ChatMessage<U>[]> {
    throw new Error("Not implemented");
  }

  // deno-lint-ignore no-explicit-any
  on(type: string, listener: (event: any) => void): () => void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  send(content: string, options?: { contentType?: string; marker?: string }): void {
    this.#socket.send(MessageFlag.MESSAGE, {
      content,
      contentType: options?.contentType ?? "text/plain",
      marker: options?.marker,
    });
  }
}

export default class ChatRoomImpl<U extends AuthUser> implements ChatRoom<U> {
  #namespace: string;
  #room: string;

  constructor(roomId: string, options?: ChatRoomOptions) {
    this.#namespace = checkNamespace(options?.namespace ?? "default");
    this.#room = checkNamespace(roomId);
  }

  get id() {
    return this.#room;
  }

  get #scope() {
    return this.#namespace + "/" + this.#room;
  }

  async connect(options?: ChatRoomConnectOptions): Promise<Chat<U>> {
    let chat: ChatImpl<U> | null = null;
    let history: ChatMessage<U>[] = [];
    let onlineUsers: U[] = [];
    const socket = await connect("chat", this.#scope, {
      signal: options?.signal,
      resolveFlag: MessageFlag.CHAT,
      initData: () => ({ ...options, lastMessageId: chat?.$lastMessageId }),
      onMessage: (flag, message) => {
        switch (flag) {
          case MessageFlag.CHAT: {
            if (chat) {
              for (const msg of history) {
                chat.$pushMessage(msg);
              }
              chat.$setOnlineUsers(onlineUsers);
            } else {
              [history, onlineUsers] = JSON.parse(dec.decode(message));
            }
            break;
          }
          case MessageFlag.MESSAGE: {
            const chatMessage = JSON.parse(dec.decode(message));
            chat?.$pushMessage(chatMessage);
            break;
          }
          case MessageFlag.EVENT: {
            const evt = JSON.parse(dec.decode(message));
            const listeners = chat?.$listeners.get(evt.type);
            if (listeners) {
              for (const listener of listeners) {
                listener(evt);
              }
            }
            break;
          }
        }
      },
      onError: (code, message, details) => {
        const listeners = chat?.$listeners.get("error");
        if (listeners) {
          for (const listener of listeners) {
            listener({ type: "error", code, message, details });
          }
        }
      },
      onStatusChange: (status) => {
        const evtName = status === SocketStatus.READY ? "online" : "offline";
        const listeners = chat?.$listeners.get(evtName);
        if (listeners) {
          for (const listener of listeners) {
            listener({ type: evtName });
          }
        }
      },
      // for debug
      inspect: (flag, gzFlag, message) => {
        const print = (buf: ArrayBuffer) => {
          if (buf.byteLength > 1024) {
            return `${dec.decode(buf.slice(0, 1024))}...(more ${buf.byteLength - 1024} bytes)`;
          }
          return dec.decode(buf);
        };
        const gzTip = gzFlag ? "(gzipped)" : "";
        switch (flag) {
          case MessageFlag.CHAT:
            return `CHAT${gzTip} ${print(message)}`;
          case MessageFlag.MESSAGE:
            return `MESSAGE${gzTip} ${print(message)}`;
          case MessageFlag.EVENT:
            return `EVENT${gzTip} ${print(message)}`;
          default:
            return `UNKNOWN ${print(message)}`;
        }
      },
    });
    chat = new ChatImpl<U>(socket, history, onlineUsers);
    return chat;
  }
}
