// Dev-server proxy for `npm start`. The production build does not use this file.
//
// Mirrors smar.nginx.conf in SAR-backend: /api/* goes to the Google Play
// backend and /ios/* goes to the App Store backend, with the prefix stripped
// (the backends serve /search, /reviews, ... at their root).
//
// Defaults to backends running on this machine. To point at something else,
// e.g. the deployed server, set the env vars before starting:
//   SMAR_PLAY_API=https://smar-tool.org/api SMAR_IOS_API=https://smar-tool.org/ios npm start
const { createProxyMiddleware } = require("http-proxy-middleware");

const DEFAULT_PLAY_API = "http://localhost:5001";
const DEFAULT_IOS_API = "http://localhost:5002";

function resolveTargets(env = process.env) {
  return {
    "/api": env.SMAR_PLAY_API || DEFAULT_PLAY_API,
    "/ios": env.SMAR_IOS_API || DEFAULT_IOS_API,
  };
}

module.exports = function setupProxy(app) {
  const targets = resolveTargets();
  Object.keys(targets).forEach((prefix) => {
    app.use(
      createProxyMiddleware(prefix, {
        target: targets[prefix],
        changeOrigin: true,
        pathRewrite: { [`^${prefix}`]: "" },
      })
    );
  });
};

module.exports.resolveTargets = resolveTargets;
module.exports.DEFAULT_PLAY_API = DEFAULT_PLAY_API;
module.exports.DEFAULT_IOS_API = DEFAULT_IOS_API;
