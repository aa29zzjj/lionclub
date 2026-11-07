import { previewNotice } from "./mock-contract";

// These replace native imports only inside the isolated preview bundle.
export const Browser = {
  async open() { previewNotice("介面預覽：外部網頁未開啟，不會連線或登入正式服務。"); },
};
export const Camera = {
  async takePhoto(): Promise<never> {
    previewNotice("介面預覽：相機未啟動，也不會要求相機或照片權限。");
    throw new Error("PREVIEW_CAMERA_DISABLED");
  },
};
// Real App's signed-out screen imports the lifecycle API. Never bridge to the
// simulator/device or retain listeners; a stopped preview has no native state.
export const App = {
  async addListener(_event: string, _listener: (...args: never[]) => unknown) {
    return { async remove() {} };
  },
};
