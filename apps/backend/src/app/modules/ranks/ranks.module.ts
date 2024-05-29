import { Module } from '@nestjs/common';
import { DbModule } from '../database/db.module';
import { ScheduleModule } from '@nestjs/schedule';
import { RanksService } from './ranks.service';
import { XpSystemsModule } from '../xp-systems/xp-systems.module';

@Module({
  imports: [
    DbModule.forRoot(),
    ScheduleModule.forRoot(),
    XpSystemsModule
  ],
  providers: [RanksService],
  exports: [RanksService],
  controllers: []
})
export class RanksModule {}
