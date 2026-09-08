import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ApiPath } from 'twenty-shared/types';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { ImportManagerService } from 'src/modules/import-manager/services/import-manager.service';
import {
  type ImportDataset,
  type ImportManagerConfig,
  type ImportResult,
} from 'src/modules/import-manager/types/import-manager.types';

type ImportManagerRequest = {
  dataset: ImportDataset;
  config: ImportManagerConfig;
};

@Controller(`${ApiPath.Rest}/import-manager`)
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
export class ImportManagerController {
  constructor(private readonly importManagerService: ImportManagerService) {}

  @Post()
  async import(@Body() body: ImportManagerRequest): Promise<ImportResult> {
    if (!body?.dataset || !body?.config?.entities?.length) {
      throw new BadRequestException(
        'dataset and config.entities are required',
      );
    }

    return this.importManagerService.import(
      body.dataset,
      body.config,
      getWorkspaceAuthContext(),
    );
  }
}
