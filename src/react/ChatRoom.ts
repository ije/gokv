import type { FC, PropsWithChildren } from "react";
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../types/common.d.ts";
import type { ChatHandler, ChatRoomProviderProps } from "../../types/react.d.ts";
import type { ChatMessage } from "../../types/ChatRoom.d.ts";
import { ChatRoom } from "../../mod.ts";
import { Context } from "./Context.ts";
import { ConnectStateContext, ConnectStateProvider } from "./ConnectState.ts";

export type ChatRoomContextProps = {
  channel?: Array<ChatMessage<AuthUser>>;
  currentUser?: AuthUser;
  onlineUsers?: Array<AuthUser>;
  handler?: ChatHandler;
};

const badHandler: ChatHandler = Object.freeze({
  pullHistory: () => {
    throw new Error("The chat room socket not connected");
  },
  send: () => {
    throw new Error("The chat room socket not connected");
  },
});

const appendMessage = (prev: Array<ChatMessage<AuthUser>>, msg: ChatMessage<AuthUser>) => {
  if (msg.marker) {
    if (msg.marker.state === "pending") {
      return [...prev, msg];
    }
    const markedMsg = prev.find((m) => m.marker?.id === msg.marker!.id);
    if (markedMsg) {
      Object.assign(markedMsg, msg);
      return [...prev]; // shallow copy
    }
  }
  return [...prev, msg];
};

export const ChatRoomContext = createContext<ChatRoomContextProps>({});

const _ChatRoomProvider: FC<PropsWithChildren<ChatRoomProviderProps>> = (props) => {
  const ctx = useContext(Context);
  const { setState: setConnState } = useContext(ConnectStateContext);
  const namespace = props.namespace || ctx.namespace;
  const region = props.region || ctx.region;
  const room = useMemo(() => new ChatRoom(props.id, { namespace, region }), [props.id, namespace]);
  const [channel, setChannel] = useState<Array<ChatMessage<AuthUser>>>(() => []);
  const [currentUser, setCurrentUser] = useState<AuthUser>(() => ({ uid: 0, name: "-", email: "-" }));
  const [onlineUsers, setOnlineUsers] = useState<Array<AuthUser>>(() => []);
  const [handler, setHandler] = useState<ChatHandler>(() => badHandler);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const value: Required<ChatRoomContextProps> = useMemo(() => {
    return { channel, currentUser, onlineUsers, handler };
  }, [channel, currentUser, onlineUsers, handler]);

  useEffect(() => {
    const ac = new AbortController();
    const sync = async (retryTimes = 0) => {
      setPending(true);
      try {
        const chat = await room.connect({
          signal: ac.signal,
        });
        chat.on("statechange", () => setConnState(chat.state));
        chat.on("error", (err) => setError(new Error(err.message)));
        chat.on("userjoin", (e) => {
          setOnlineUsers((prev) => !prev.find((u) => u.uid === e.user.uid) ? [...prev, e.user] : prev);
        });
        chat.on("userleave", (e) => {
          setOnlineUsers((prev) => prev.filter((u) => u.uid !== e.user.uid));
        });
        setCurrentUser(chat.currentUser);
        setOnlineUsers(chat.onlineUsers as typeof onlineUsers);
        setHandler({
          pullHistory: async (n) => {
            const history = await chat.pullHistory(n);
            setChannel((prev) => [...history, ...prev]);
          },
          send: (content, options) => {
            const now = Date.now();
            const markerId = `mk-${now.toString(36)}${Math.random().toString(36).slice(2)}`;
            setChannel((prev) =>
              appendMessage(prev, {
                ...options,
                id: markerId,
                marker: {
                  id: markerId,
                  state: "pending",
                },
                content,
                contentType: options?.contentType ?? "text/plain",
                createdAt: now,
                createdBy: currentUser,
              })
            );
            chat.send(content, { ...options, markerId });
          },
        });
        setPending(false);
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
          setPending(false);
        }
      }
    };
    sync();
    return () => ac.abort();
  }, [room]);

  if (pending) {
    return props.fallback ?? null;
  }
  if (error) {
    throw error;
  }
  return createElement(ChatRoomContext.Provider, { value }, props.children);
};

export const ChatRoomProvider: FC<PropsWithChildren<ChatRoomProviderProps>> = (props) => {
  return createElement(ConnectStateProvider, null, createElement(_ChatRoomProvider, props));
};

export const useChatChannel = <U extends AuthUser>(): Array<ChatMessage<U>> => {
  const { channel } = useContext(ChatRoomContext);

  if (!channel) {
    throw new Error("No chat room found, please wrap your component within <ChatRoomProvider />.");
  }

  return channel as Array<ChatMessage<U>>;
};

export const useChatCurrentUser = <U extends AuthUser>(): U => {
  const { currentUser } = useContext(ChatRoomContext);

  if (!currentUser) {
    throw new Error("No chat room found, please wrap your component within <ChatRoomProvider />.");
  }

  return currentUser as U;
};

export const useChatOnlineUsers = <U extends AuthUser>(): Array<U> => {
  const { onlineUsers } = useContext(ChatRoomContext);

  if (!onlineUsers) {
    throw new Error("No chat room found, please wrap your component within <ChatRoomProvider />.");
  }

  return onlineUsers as Array<U>;
};

export const useChatHandler = (): ChatHandler => {
  const { handler } = useContext(ChatRoomContext);

  if (!handler) {
    throw new Error("No chat room found, please wrap your component within <ChatRoomProvider />.");
  }

  return handler;
};
