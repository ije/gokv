import type {
  AuthUser,
  ChatRoom,
  ChatRoomOptions,
  CoEdit,
  Module,
  ModuleConfigOptions,
  Uploader,
  UploaderOptions,
} from "./types/web.d.ts";
import atm from "./src/common/AccessTokenManager.ts";
import UploaderImpl from "./src/Uploader.ts";
import ChatRoomImpl from "./src/ChatRoom.ts";
import CoEditImpl from "./src/CoEdit.ts";

class ModuleImpl implements Module {
  config({ signUrl }: ModuleConfigOptions) {
    atm.setSignUrl(signUrl);
  }
  Uploader(options?: UploaderOptions): Uploader {
    return new UploaderImpl(options);
  }
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U> {
    return new ChatRoomImpl(roomId, options);
  }
  // deno-lint-ignore ban-types
  CoEdit<T extends object>(documentId: string): CoEdit<T> {
    return new CoEditImpl(documentId);
  }
}

export { UploaderImpl as Uploader };

export default new ModuleImpl();
