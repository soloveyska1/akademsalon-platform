import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");

rmSync(dist, { recursive: true, force: true });
mkdirSync(client, { recursive: true });
mkdirSync(server, { recursive: true });

const publicDirectories = ["assets", "bimi"];
for (const directory of publicDirectories) {
  const source = join(root, directory);
  if (existsSync(source)) {
    cpSync(source, join(client, directory), { recursive: true });
  }
}

const publicRootExtensions = new Set([
  ".gif",
  ".html",
  ".ico",
  ".json",
  ".txt",
  ".webmanifest",
  ".xml",
]);

for (const entry of readdirSync(root)) {
  const source = join(root, entry);
  if (!statSync(source).isFile() || !publicRootExtensions.has(extname(entry))) {
    continue;
  }
  cpSync(source, join(client, entry));
}

writeFileSync(
  join(server, "index.js"),
  `export default {
  async fetch(request, env) {
    if (!env?.ASSETS) {
      return new Response("Static asset binding is unavailable", { status: 500 });
    }

    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    if (request.method === "GET" || request.method === "HEAD") {
      const path = url.pathname;
      if (!path.endsWith("/") && !path.split("/").at(-1)?.includes(".")) {
        const htmlUrl = new URL(path + ".html" + url.search, url.origin);
        response = await env.ASSETS.fetch(new Request(htmlUrl, request));
        if (response.status !== 404) return response;
      }
    }

    const notFoundUrl = new URL("/404.html", url.origin);
    const notFound = await env.ASSETS.fetch(new Request(notFoundUrl, request));
    return new Response(notFound.body, {
      status: 404,
      headers: notFound.headers,
    });
  },
};
`,
);

console.log(`Built static preview in ${dist}`);
