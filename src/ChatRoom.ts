import type { AuthUser, Chat, ChatRoom, ChatRoomOptions } from "../types/web.d.ts";
import { checkNamespace } from "./common/utils.ts";

export default class ChatRoomImpl<U extends AuthUser> implements ChatRoom<U> {
  #roomId: string;
  #options: ChatRoomOptions;

  constructor(roomId: string, options?: ChatRoomOptions) {
    this.#roomId = checkNamespace(roomId);
    this.#options = options ?? {};
  }

  connect(): Promise<Chat<U>> {
    throw new Error("not implemented");
  }
}
