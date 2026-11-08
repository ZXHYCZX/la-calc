const { app, BrowserWindow } = require("electron");
function create() {
  const w = new BrowserWindow({
    width: 440, height: 880, autoHideMenuBar: true,
    title: "线性代数计算器",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  w.loadFile("web/index.html");
}
app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
