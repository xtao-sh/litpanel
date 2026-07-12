import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("nberDesktop", {
  platform: process.platform,
});
