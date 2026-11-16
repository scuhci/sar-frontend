/** @jest-environment node */

const http = require("http");
const setupProxy = require("./setupProxy");

const servers = [];
let proxyServer;
let proxyAddress;
let originalPlayApi;
let originalIosApi;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  if (!server || !server.listening) return Promise.resolve();
  if (typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function startBackend(name) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = req.method === "POST" ? Buffer.concat(chunks).toString() : "";
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`${name} ${req.method} ${req.url}${body}`);
    });
  });
  servers.push(server);
  return listen(server);
}

function request(path, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: proxyAddress.port,
        path,
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : undefined,
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          })
        );
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

beforeAll(async () => {
  originalPlayApi = process.env.SMAR_PLAY_API;
  originalIosApi = process.env.SMAR_IOS_API;

  try {
    const [playAddress, iosAddress] = await Promise.all([
      startBackend("play"),
      startBackend("ios"),
    ]);
    process.env.SMAR_PLAY_API = `http://127.0.0.1:${playAddress.port}`;
    process.env.SMAR_IOS_API = `http://127.0.0.1:${iosAddress.port}`;

    const middlewares = [];
    setupProxy({ use: (middleware) => middlewares.push(middleware) });
    proxyServer = http.createServer((req, res) => {
      let index = 0;
      const next = () => {
        const middleware = middlewares[index++];
        if (middleware) {
          middleware(req, res, next);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end(`unproxied ${req.url}`);
        }
      };
      next();
    });
    servers.push(proxyServer);
    proxyAddress = await listen(proxyServer);
  } catch (error) {
    await Promise.all(servers.map(close));
    if (originalPlayApi === undefined) {
      delete process.env.SMAR_PLAY_API;
    } else {
      process.env.SMAR_PLAY_API = originalPlayApi;
    }
    if (originalIosApi === undefined) {
      delete process.env.SMAR_IOS_API;
    } else {
      process.env.SMAR_IOS_API = originalIosApi;
    }
    throw error;
  }
});

afterAll(async () => {
  try {
    await Promise.all(servers.map(close));
  } finally {
    if (originalPlayApi === undefined) {
      delete process.env.SMAR_PLAY_API;
    } else {
      process.env.SMAR_PLAY_API = originalPlayApi;
    }
    if (originalIosApi === undefined) {
      delete process.env.SMAR_IOS_API;
    } else {
      process.env.SMAR_IOS_API = originalIosApi;
    }
  }
});

test("proxies API and iOS paths with their suffixes and query strings intact", async () => {
  await expect(request("/api/search?query=a%20b&countryCode=US")).resolves.toEqual({
    status: 200,
    body: "play GET /search?query=a%20b&countryCode=US",
  });
  await expect(request("/ios/reviews?appId=1")).resolves.toEqual({
    status: 200,
    body: "ios GET /reviews?appId=1",
  });
});

test("forwards POST bodies to the play API", async () => {
  const body = JSON.stringify({ email: "person@example.com" });

  await expect(request("/api/email", { method: "POST", body })).resolves.toEqual({
    status: 200,
    body: `play POST /email${body}`,
  });
});

test.each(["/apiary/x", "/ios-thing"])(
  "does not proxy the bare-prefix lookalike %s",
  async (path) => {
    await expect(request(path)).resolves.toEqual({
      status: 404,
      body: `unproxied ${path}`,
    });
  }
);
