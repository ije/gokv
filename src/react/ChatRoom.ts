import type { FC, PropsWithChildren } from "react";
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../types/common.d.ts";
import type { ChatRoomProviderProps } from "../../types/react.d.ts";
import type { ChatMessage } from "../../types/ChatRoom.d.ts";
import { ChatRoom } from "../../mod.ts";
import { Context } from "./Context.ts";

type Chat<U extends AuthUser> = {
  readonly channel: ReadonlyArray<ChatMessage<U>>;
  readonly onlineUsers: ReadonlyArray<U>;
  pullHistory(n?: number): Promise<ReadonlyArray<ChatMessage<U>>>;
  send(content: string, options?: { contentType?: string; marker?: string }): void;
};

export type ChatRoomContextProps = {
  chat?: Chat<AuthUser>;
  online: boolean;
};

export const ChatRoomContext = createContext<ChatRoomContextProps>({
  online: false,
});

export const ChatRoomProvider: FC<PropsWithChildren<ChatRoomProviderProps>> = (props) => {
  const { namespace: parentNamespace } = useContext(Context);
  const namespace = props.namespace || parentNamespace;
  const room = useMemo(() => new ChatRoom(props.id, { namespace }), [props.id, namespace]);
  const [chat, setChat] = useState<Chat<AuthUser> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const sync = async (retryTimes = 0) => {
      setLoading(true);
      try {
        const chat = await room.connect({
          signal: ac.signal,
        });
        chat.on("online", () => setOnline(true));
        chat.on("offline", () => setOnline(false));
        chat.on("error", (err) => setError(new Error(err.message)));
        setChat(chat);
        setLoading(false);
      } catch (err) {
        if (err.message !== "aborted" && retryTimes < 3) {
          const delay = (retryTimes + 1) * 100;
          setTimeout(() => sync(retryTimes + 1), delay);
          console.warn(`[gokv] fail to connect chat room(${room.id}), retry after ${delay}ms ...`);
        } else {
          setError(err);
          setLoading(false);
        }
      }
    };
    sync();
    return () => ac.abort();
  }, [room]);

  if (loading) {
    return props.fallback ?? null;
  }
  if (error) {
    throw error;
  }
  return createElement(ChatRoomContext.Provider, { value: { chat: chat ?? undefined, online } }, props.children);
};

export const useChat = <U extends AuthUser>(): Chat<U> => {
  const { chat } = useContext(ChatRoomContext);

  if (!chat) {
    throw new Error("No document found, please wrap your component with <ChatRoomProvider />.");
  }

  return chat as Chat<U>;
};
