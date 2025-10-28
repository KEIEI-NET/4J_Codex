export interface BaseEntity {
  type: string;
  id?: string;
}

export interface FileEntity extends BaseEntity {
  type: "File";
  id: string;
  path: string;
  lang: string;
  hash?: string;
  loc?: number;
}

export interface SymbolEntity extends BaseEntity {
  type: "Symbol";
  id: string;
  kind: string;
  name: string;
  fqname: string;
  fileId: string;
  start?: number;
  end?: number;
  annotations?: string[];
  tags?: string[];
}

export interface RelEntity extends BaseEntity {
  type: "Rel";
  id?: string;
  rel: string;
  from: string;
  to: string;
  weight?: number;
  httpMethod?: string;
  url?: string;
  method?: string;
  driver?: string;
  file?: string;
  startLine?: number;
  [key: string]: unknown;
}

export interface DbQueryEntity extends BaseEntity {
  type: "DBQuery";
  id: string;
  raw: string;
  op: string;
  allowFiltering?: boolean;
  driver?: string;
  method?: string;
  prepared?: boolean;
  batch?: boolean;
  file?: string;
  startLine?: number;
  language?: string;
  [key: string]: unknown;
}

export interface RuleHitEntity extends BaseEntity {
  type: "RuleHit";
  rule: string;
  entity: string;
  severity: string;
  file?: string;
  line?: number;
  suggest?: string;
}

export type IrEntity =
  | FileEntity
  | SymbolEntity
  | RelEntity
  | DbQueryEntity
  | RuleHitEntity;

export interface NormalizeOptions {
  readonly strict?: boolean;
}
