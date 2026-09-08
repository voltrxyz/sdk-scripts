import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// NodeNext needs explicit file extensions, including directory barrel imports.
function normalizeImports(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) normalizeImports(path);
    else if (path.endsWith(".ts")) {
      writeFileSync(path, readFileSync(path, "utf8").replace(
        /from "(\.[^"]+)"/g,
        (_, target) => `from "${target}${statSync(join(directory, target + ".ts"), { throwIfNoEntry: false }) ? ".js" : "/index.js"}"`
      ));
    }
  }
}
for (const [idlName, folder] of [["ntbundle", "generated"], ["voltr_vault", "generated-vault"]]) {
  const idl = JSON.parse(readFileSync(new URL(`./idl/${idlName}.json`, import.meta.url), "utf8"));
  const generatedFolder = `src/${folder}`;
  await createFromRoot(rootNodeFromAnchor(idl)).accept(
    renderVisitor(fileURLToPath(new URL(".", import.meta.url)), { generatedFolder })
  );
  normalizeImports(fileURLToPath(new URL(`./${generatedFolder}`, import.meta.url)));
}
