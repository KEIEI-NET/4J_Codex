export interface BaseEntity {
  type: string;
  id: string;
}

export interface FileEntity extends BaseEntity {
  type: "File";
  path: string;
  lang: string;
  hash?: string;
  loc?: number;
}

export interface SymbolEntity extends BaseEntity {
  type: "Symbol";
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
  rel: string;
  from: string;
  to: string;
  weight?: number;
}

export interface DbQueryEntity extends BaseEntity {
  type: "DBQuery";
  raw: string;
  op: string;
  allowFiltering?: boolean;
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
