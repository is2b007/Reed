import path from "node:path";

export interface ReedProjectPaths {
  root: string;
  reedDir: string;
  database: string;
  backups: string;
  exports: string;
}

export function resolveProjectPaths(projectRoot: string): ReedProjectPaths {
  const root = path.resolve(projectRoot);
  const reedDir = path.join(root, ".reed");
  return {
    root,
    reedDir,
    database: path.join(reedDir, "reed.sqlite"),
    backups: path.join(reedDir, "backups"),
    exports: path.join(root, "exports"),
  };
}
