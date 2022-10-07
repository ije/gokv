import type { AuthUser, Chat, ChatRoom, ChatRoomOptions } from "../types/web.d.ts";

export default class ChatRoomImpl<U extends AuthUser> implements ChatRoom<U> {
  #roomId: string;
  #options: ChatRoomOptions;

  constructor(roomId: string, options?: ChatRoomOptions) {
    this.#roomId = roomId;
    this.#options = options ?? {};
  }

  async connect(): Promise<Chat<U>> {
    return {} as Chat<U>;
  }

  disconnect() {
    console.log("disconnect");
  }
}
