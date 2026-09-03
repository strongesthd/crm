import { Injectable } from '@nestjs/common';
import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceTransactionScope } from 'src/engine/twenty-orm/types/workspace-transaction-scope.type';
import {
  type ImportDataset,
  type ImportEntityConfig,
  type ImportError,
  type ImportManagerConfig,
  type ImportRecord,
  type ImportResult,
  type ImportRow,
} from 'src/modules/import-manager/types/import-manager.types';

@Injectable()
export class ImportManagerService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async import(
    dataset: ImportDataset,
    config: ImportManagerConfig,
    authContext: WorkspaceAuthContext,
  ): Promise<ImportResult> {
    return this.workspaceOrmManager.executeInWorkspaceContext(
      () => this.importInWorkspaceContext(dataset, config),
      authContext,
    );
  }

  private async importInWorkspaceContext(
    dataset: ImportDataset,
    config: ImportManagerConfig,
  ): Promise<ImportResult> {
    const errors: ImportError[] = [];
    const recordsByEntity = new Map<string, Map<string, string>>();
    let imported = 0;
    const batchSize = config.batchSize ?? 500;

    for (const entityConfig of config.entities) {
      const entityRecords = new Map<string, string>();
      recordsByEntity.set(entityConfig.objectName, entityRecords);
      const rows = dataset[entityConfig.objectName] ?? [];

      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);

        for (let index = 0; index < batch.length; index += 1) {
          const row = batch[index];

          try {
            const saved = await this.workspaceOrmManager.runInWorkspaceTransaction(
              async (transactionScope) => {
                const values = this.mapRow(row, entityConfig);
                await this.resolveRelations(
                  values,
                  row,
                  entityConfig,
                  transactionScope,
                  recordsByEntity,
                );

                return transactionScope
                  .getRepository<ImportRecord>(entityConfig.objectName)
                  .save(values);
              },
            );

            const sourceKey = String(
              row[entityConfig.fields[0]?.source] ?? offset + index,
            );
            entityRecords.set(sourceKey, saved.id);
            imported += 1;
          } catch (error) {
            errors.push({
              entity: entityConfig.objectName,
              rowIndex: offset + index,
              row,
              reason:
                error instanceof Error ? error.message : 'Unknown import error',
            });
          }
        }
      }
    }

    return { imported, failed: errors.length, errors };
  }

  private mapRow(row: ImportRow, config: ImportEntityConfig): ImportRecord {
    const values = {} as ImportRecord;

    for (const mapping of config.fields) {
      const value = mapping.transform
        ? mapping.transform(row[mapping.source], row)
        : row[mapping.source];

      if (mapping.required && !isDefined(value)) {
        throw new Error(`Required field "${mapping.source}" is missing`);
      }

      if (isDefined(value)) {
        values[mapping.target] = value;
      }
    }

    return values;
  }

  private async resolveRelations(
    values: ImportRecord,
    row: ImportRow,
    entityConfig: ImportEntityConfig,
    transactionScope: WorkspaceTransactionScope,
    recordsByEntity: Map<string, Map<string, string>>,
  ): Promise<void> {
    for (const relation of entityConfig.relations ?? []) {
      const reference = row[relation.sourceField];

      if (!isDefined(reference) || reference === '') {
        continue;
      }

      const parentRecords = recordsByEntity.get(relation.parentObject);
      let parentId = parentRecords?.get(String(reference));

      if (!parentId && relation.parentNameField) {
        const parentRepository = transactionScope.getRepository<ImportRecord>(
          relation.parentObject,
        );
        const existing = await parentRepository.findOneBy({
          [relation.parentNameField]: reference,
        });

        parentId = existing?.id;

        if (!parentId && relation.createIfMissing) {
          const created = await parentRepository.save({
            [relation.parentNameField]: reference,
          } as ImportRecord);
          parentId = created.id;
          parentRecords?.set(String(reference), parentId);
        }
      }

      if (!parentId) {
        throw new Error(
          `Related ${relation.parentObject} record "${String(reference)}" was not found`,
        );
      }

      values[relation.targetField] = parentId;
    }

  }
}
