import { Module } from '@nestjs/common';

import { WorkspaceDataSourceModule } from 'src/engine/workspace-datasource/workspace-datasource.module';
import { ImportManagerService } from 'src/modules/import-manager/services/import-manager.service';

@Module({
  imports: [WorkspaceDataSourceModule],
  providers: [ImportManagerService],
  exports: [ImportManagerService],
})
export class ImportManagerModule {}
