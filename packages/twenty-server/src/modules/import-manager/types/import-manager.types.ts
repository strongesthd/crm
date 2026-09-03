import { type ObjectRecord } from 'twenty-shared/types';

export type ImportRow = Record<string, unknown>;

export type ImportFieldMapping = {
  source: string;
  target: string;
  transform?: (value: unknown, row: ImportRow) => unknown;
  required?: boolean;
};

export type ImportRelationMapping = {
  targetField: string;
  parentObject: string;
  sourceField: string;
  parentNameField?: string;
  createIfMissing?: boolean;
};

export type ImportEntityConfig = {
  objectName: string;
  fields: ImportFieldMapping[];
  relations?: ImportRelationMapping[];
};

export type ImportManagerConfig = {
  entities: ImportEntityConfig[];
  batchSize?: number;
};

export type ImportError = {
  entity: string;
  rowIndex: number;
  row: ImportRow;
  reason: string;
};

export type ImportResult = {
  imported: number;
  failed: number;
  errors: ImportError[];
};

export type ImportDataset = Record<string, ImportRow[]>;

export type ImportRecord = ObjectRecord & Record<string, unknown>;
