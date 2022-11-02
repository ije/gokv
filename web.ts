import type {
  AuthUser,
  ChatRoom,
  ChatRoomOptions,
  Document,
  DocumentOptions,
  FileStorage,
  FileStorageOptions,
  Module,
  ModuleConfigOptions,
} from "./types/web.d.ts";
import atm from "./src/AccessTokenManager.ts";
import FileStorageImpl from "./src/FileStorage.ts";
import ChatRoomImpl from "./src/ChatRoom.ts";
import DocumentImpl from "./src/Document.ts";
import { snapshot, subscribe } from "./src/common/proxy.ts";

class ModuleImpl implements Module {
  config({ signUrl }: ModuleConfigOptions) {
    atm.setSignUrl(signUrl);
  }
  FileStorage(options?: FileStorageOptions): FileStorage {
    return new FileStorageImpl(options);
  }
  ChatRoom<U extends AuthUser>(roomId: string, options?: ChatRoomOptions): ChatRoom<U> {
    return new ChatRoomImpl(roomId, options);
  }
  Document<T extends Record<string, unknown> | Array<unknown>>(
    documentId: string,
    options?: DocumentOptions<T>,
  ): Document<T> {
    return new DocumentImpl(documentId, options);
  }
}

export { ChatRoomImpl as ChatRoom, DocumentImpl as Document, snapshot, subscribe, UploaderImpl as Uploader };

export default new ModuleImpl();
