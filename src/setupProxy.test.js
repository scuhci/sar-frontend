const fs = require("fs");
const path = require("path");
const setupProxy = require("./setupProxy");

describe("dev-server proxy", () => {
  test("package.json no longer hard-codes a production proxy target", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    );
    expect(pkg.proxy).toBeUndefined();
  });

  test("defaults to local backends", () => {
    expect(setupProxy.resolveTargets({})).toEqual({
      "/api": "http://localhost:5001",
      "/ios": "http://localhost:5002",
    });
  });

  test("SMAR_PLAY_API / SMAR_IOS_API override the targets", () => {
    expect(
      setupProxy.resolveTargets({
        SMAR_PLAY_API: "https://smar-tool.org/api",
        SMAR_IOS_API: "https://smar-tool.org/ios",
      })
    ).toEqual({
      "/api": "https://smar-tool.org/api",
      "/ios": "https://smar-tool.org/ios",
    });
  });

  test("registers one middleware per backend prefix", () => {
    const app = { use: jest.fn() };
    setupProxy(app);
    expect(app.use).toHaveBeenCalledTimes(2);
    app.use.mock.calls.forEach(([middleware]) => {
      expect(typeof middleware).toBe("function");
    });
  });
});
