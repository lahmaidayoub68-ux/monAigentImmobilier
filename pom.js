import fs from "fs";

const file = "./server.js";

let content = fs.readFileSync(file, "utf8");

content = content
  .replace(/\u00A0/g, " ")
  .replace(/\u200B/g, "")
  .replace(/\t/g, " ")
  .replace(/\r/g, "");

fs.writeFileSync(file, content);

console.log("CLEAN OK");
