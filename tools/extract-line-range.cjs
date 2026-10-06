const fs = require("node:fs");
const crypto = require("node:crypto");

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

function lineStartOffsets(buffer) {
  const offsets = [0];
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0x0a) offsets.push(index + 1);
  }
  return offsets;
}

const sourcePath = readArg("--source");
const componentPath = readArg("--component");
const startLine = Number(readArg("--start"));
const endLine = Number(readArg("--end"));
const header = process.argv.includes("--header-b64")
  ? Buffer.from(readArg("--header-b64"), "base64")
  : Buffer.from(readArg("--header"), "utf8");
const footer = Buffer.from(readArg("--footer"), "utf8");
const usage = Buffer.from(readArg("--usage"), "utf8");
const source = fs.readFileSync(sourcePath);
const offsets = lineStartOffsets(source);
const bom = source.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
const crlf = (source.toString("binary").match(/\r\n/g) || []).length;
const lf = (source.toString("binary").match(/(?<!\r)\n/g) || []).length;
if (bom) throw new Error("BOM source is unsupported by this exact-range tool; preserve it explicitly first");
if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine >= offsets.length) throw new Error("Invalid line range");
const start = offsets[startLine - 1];
const end = endLine < offsets.length - 1 ? offsets[endLine] : source.length;
const moved = source.slice(start, end);
const component = Buffer.concat([header, moved, footer]);
const nextSource = Buffer.concat([source.slice(0, start), usage, source.slice(end)]);
fs.writeFileSync(componentPath, component);
fs.writeFileSync(sourcePath, nextSource);
const movedOffset = header.length;
const movedAgain = component.slice(movedOffset, movedOffset + moved.length);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
if (!moved.equals(movedAgain)) throw new Error("Moved slice hash check failed");
if (nextSource.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) !== bom) throw new Error("BOM changed");
const nextText = nextSource.toString("binary");
const nextCrlf = (nextText.match(/\r\n/g) || []).length;
const nextLf = (nextText.match(/(?<!\r)\n/g) || []).length;
if ((crlf > 0) !== (nextCrlf > 0) || (lf > 0) !== (nextLf > 0)) throw new Error("Line ending style changed");
console.log(JSON.stringify({ sourcePath, componentPath, startLine, endLine, bytes: moved.length, sha256: hash(moved), byteIdentical: true, bom, crlf, lf }));
