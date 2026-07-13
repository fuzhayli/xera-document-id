const fs = require("node:fs");
const path = require("node:path");

const SECURITY_HEADERS = {
  "content-security-policy": "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let byteLength = 0;
    req.on("data", chunk => {
      body += chunk;
      byteLength += chunk.length;
      if (byteLength > 1_000_000) {
        reject(httpError(413, "payload_too_large", "Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(httpError(400, "invalid_json", "Request body must be valid JSON."));
      }
    });
  });
}

function readBinary(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;
    req.on("data", chunk => {
      chunks.push(chunk);
      totalLength += chunk.length;
      if (totalLength > 20_000_000) {
        reject(httpError(413, "payload_too_large", "Excel file is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", err => {
      reject(err);
    });
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendBinary(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "cache-control": "no-store",
    ...headers,
    "content-length": body.length
  });
  res.end(body);
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, SECURITY_HEADERS);
  res.end();
}

function sendRedirect(res, location) {
  res.writeHead(302, { ...SECURITY_HEADERS, "cache-control": "no-store", location });
  res.end();
}

function serveStatic(res, requestPath, publicDir) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const decodedPath = decodeURIComponent(normalizedPath);
  const absolutePath = path.resolve(publicDir, `.${decodedPath}`);

  const isInsidePublic = absolutePath === publicDir || absolutePath.startsWith(publicDir + path.sep);
  if (!isInsidePublic) {
    return sendJson(res, 403, { error: "forbidden", message: "Invalid static path." });
  }

  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    return sendJson(res, 404, { error: "not_found", message: "Static file not found." });
  }

  const contentType = getContentType(absolutePath);
  const body = fs.readFileSync(absolutePath);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    // Static filenames are not content-hashed, so every navigation must
    // revalidate them or a deployment can leave users on stale CSS/JS.
    "cache-control": contentType.startsWith("text/html") ? "no-store" : "no-cache",
    "content-type": contentType,
    "content-length": body.length
  });
  res.end(body);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  return "application/octet-stream";
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = {
  readJson,
  readBinary,
  sendJson,
  sendBinary,
  sendEmpty,
  sendRedirect,
  serveStatic,
  httpError
};
