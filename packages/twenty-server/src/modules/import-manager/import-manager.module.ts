import { Module } from '@nestjs/common';

import { WorkspaceDataSourceModule } from 'src/engine/workspace-datasource/workspace-datasource.module';
import { ImportManagerController } from 'src/modules/import-manager/controllers/import-manager.controller';
import { ImportManagerService } from 'src/modules/import-manager/services/import-manager.service';

@Module({
  imports: [WorkspaceDataSourceModule],
  controllers: [ImportManagerController],
  providers: [ImportManagerService],
  exports: [ImportManagerService],
})
export class ImportManagerModule {}
