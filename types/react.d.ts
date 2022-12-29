/// <reference lib="dom" />

import type { FC, ImgHTMLAttributes, PropsWithChildren, ReactElement } from "react";
import { AuthUser } from "./common.d.ts";
import type { ChatMessage } from "./ChatRoom.d.ts";

export type SocketStatus = {
  online: boolean;
};

export type GokvContextProps = {
  namespace: string;
  imagesHost: string;
};

export type GokvProviderProps = {
  tokenSignUrl?: string;
  tokenMaxAge?: number;
} & Partial<GokvContextProps>;

export const GokvProvider: FC<PropsWithChildren<GokvProviderProps>>;

export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onChange"> {
  fit?: "cover" | "contain";
  quality?: number;
  blurPreview?: "sm" | "base" | "md" | "lg";
  onChange?: (e: { src: string; alt: string }) => void;
}

export const useImageSrc: (props: Pick<ImageProps, "src" | "width" | "height" | "quality" | "fit">) => {
  src?: string;
  srcSet?: string;
  aspectRatio?: number;
  placeholder?: string;
};

export const Image: FC<ImageProps>;

export type DocumentProviderProps = {
  // the namespace of the document, default to "default"
  namespace?: string;
  // the document id
  id: string;
  // fallback UI for when the document is not available, blank by default
  fallback?: ReactElement;
  // the initial data of the document, optional
  initialData?: Record<string, unknown>;
};

export const DocumentProvider: FC<PropsWithChildren<DocumentProviderProps>>;

export const useDocument: <T extends Record<string, unknown>>() => T;
export const useDocumentSocketStatus: () => SocketStatus;

export const useSnapshot: <T extends Record<string, unknown> | Array<unknown>>(obj: T) => T;
export const useSnapshotValue: <T extends Record<string, unknown>, K extends keyof T>(obj: T, key: K) => T[K];

export type ChatHandler = {
  pullHistory(n?: number): Promise<void>;
  send(content: string, options?: { contentType?: string; marker?: string }): void;
};

export type ChatRoomProviderProps = {
  // the namespace of the chat room, default to "default"
  namespace?: string;
  // the chat room id
  id: string;
  // fallback UI for when the document is not available, blank by default
  fallback?: ReactElement;
};

export const ChatRoomProvider: FC<PropsWithChildren<ChatRoomProviderProps>>;

export const useChatChannel: <U extends AuthUser>() => Array<ChatMessage<U>>;
export const useChatOnlineUsers: <U extends AuthUser>() => Array<U>;
export const useChatHandler: () => ChatHandler;
export const useChatSocketStatus: () => SocketStatus;
