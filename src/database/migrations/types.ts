export interface Migration {
  /** Strictly increasing schema version, stored in PRAGMA user_version. */
  version: number;
  name: string;
  statements: string[];
}
