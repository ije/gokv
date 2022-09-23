import type { Module, ModuleConfigOptions } from "./types/web.d.ts";
import atm from "./src/AccessTokenManager.ts";
import UploaderImpl from "./src/Uploader.ts";

class ModuleImpl implements Module {
  config({ signUrl }: ModuleConfigOptions) {
    atm.setSignUrl(signUrl);
  }
}

export { UploaderImpl as Uploader };

export default new ModuleImpl();
