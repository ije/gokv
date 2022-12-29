import type { FC, PropsWithChildren } from "react";
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../types/common.d.ts";
import type { ChatHandler, ChatRoomProviderProps, SocketStatus } from "../../types/react.d.ts";
import type { ChatMessage } from "../../types/ChatRoom.d.ts";
import { ChatRoom } from "../../mod.ts";
import { Context } from "./Context.ts";

export type ChatRoomContextProps = {
  channel?: Array<ChatMessage<AuthUser>>;
  onlineUsers?: Array<AuthUser>;
  handler?: ChatHandler;
  socketStatus?: SocketStatus;
};

const badHandler: ChatHandler = Object.freeze({
  pullHistory: () => {
    throw new Error("chat room socket not connected");
  },
  send: () => {
    throw new Error("chat room socket not connected");
  },
});

// sort messages by `createdAt`
const appendMessage = (prev: Array<ChatMessage<AuthUser>>, msg: ChatMessage<AuthUser>) => {
  const i = prev.findIndex((m) => m.createdAt > msg.createdAt);
  if (i === -1) {
    return [...prev, msg];
  }
  return [...prev.slice(0, i), msg, ...prev.slice(i)];
};

export const ChatRoomContext = createContext<ChatRoomContextProps>({});

export const ChatRoomProvider: FC<PropsWithChildren<ChatRoomProviderProps>> = (props) => {
  const { namespace: defaultNS } = useContext(Context);
  const namespace = props.namespace || defaultNS;
  const room = useMemo(() => new ChatRoom(props.id, { namespace }), [props.id, namespace]);
  const [channel, setChannel] = useState<Array<ChatMessage<AuthUser>>>([]);
  const [onlineUsers, setOnlineUsers] = useState<Array<AuthUser>>([]);
  const [handler, setHandler] = useState<ChatHandler>(badHandler);
  const [online, setOnline] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const value: Required<ChatRoomContextProps> = useMemo(() => {
    return { channel, onlineUsers, handler, socketStatus: { online } };
  }, [channel, onlineUsers, handler, online]);

  useEffect(() => {
    const ac = new AbortController();
    const sync = async (retryTimes = 0) => {
      setWaiting(true);
      try {
        const chat = await room.connect({
          signal: ac.signal,
        });
        chat.on("online", () => setOnline(true));
        chat.on("offline", () => setOnline(false));
        chat.on("error", (err) => setError(new Error(err.message)));
        chat.on("userjoin", (e) => {
          setOnlineUsers((prev) => !prev.find((u) => u.uid === e.user.uid) ? [...prev, e.user] : prev);
        });
        chat.on("userleave", (e) => {
          setOnlineUsers((prev) => prev.filter((u) => u.uid !== e.user.uid));
        });
        setOnlineUsers(chat.onlineUsers as typeof onlineUsers);
        setHandler({
          pullHistory: async (n?: number) => {
            const history = await chat.pullHistory(n);
            setChannel((prev) => {
              for (const msg of history) {
                prev = appendMessage(prev, msg);
              }
              return prev;
            });
          },
          send: chat.send.bind(chat),
        });
        setWaiting(false);
        (async () => {
          for await (const msg of chat.channel) {
            setChannel((prev) => appendMessage(prev, msg));
          }
        })();
      } catch (err) {
        if (err.message !== "aborted" && retryTimes < 3) {
          const delay = (retryTimes + 1) * 100;
          setTimeout(() => sync(retryTimes + 1), delay);
          console.warn(`[gokv] fail to connect chat room(${room.id}), retry after ${delay}ms ...`);
        } else {
          setError(err);
          setWaiting(false);
        }
      }
    };
    sync();
    return () => ac.abort();
  }, [room]);

  if (waiting) {
    return props.fallback ?? null;
  }
  if (error) {
    throw error;
  }
  return createElement(ChatRoomContext.Provider, { value }, props.children);
};

export const useChatChannel = <U extends AuthUser>(): Array<ChatMessage<U>> => {
  const { channel } = useContext(ChatRoomContext);

  if (!channel) {
    throw new Error("No chat room found, please wrap your component with <ChatRoomProvider />.");
  }

  return channel as Array<ChatMessage<U>>;
};

export const useChatOnlineUsers = <U extends AuthUser>(): Array<U> => {
  const { onlineUsers } = useContext(ChatRoomContext);

  if (!onlineUsers) {
    throw new Error("No chat room found, please wrap your component with <ChatRoomProvider />.");
  }

  return onlineUsers as Array<U>;
};

export const useChatHandler = (): ChatHandler => {
  const { handler } = useContext(ChatRoomContext);

  if (!handler) {
    throw new Error("No chat room found, please wrap your component with <ChatRoomProvider />.");
  }

  return handler;
};

export const useChatSocketStatus = (): SocketStatus => {
  const { socketStatus } = useContext(ChatRoomContext);

  if (!socketStatus) {
    throw new Error("No chat room found, please wrap your component with <ChatRoomProvider />.");
  }

  return socketStatus;
};
