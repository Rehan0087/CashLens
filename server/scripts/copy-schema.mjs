import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(scriptsDir, "..");
const source = path.join(serverDir, "src", "db", "schema.sql");
const destinationDir = path.join(serverDir, "dist", "db");

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, path.join(destinationDir, "schema.sql"));
