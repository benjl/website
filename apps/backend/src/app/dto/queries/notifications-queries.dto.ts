import {IntCsvQueryProperty} from '../decorators';
import {QueryDto} from './query.dto';
import {IsBoolean, IsOptional} from 'class-validator';
import {ApiProperty} from '@nestjs/swagger';

export class NotifsMarkAsReadQueryDto extends QueryDto {
  @IntCsvQueryProperty({ description: 'List of notification IDs to mark as read' })
  notifIDs?: number[]

  @ApiProperty({ description: 'If true, notifIDs is ignored and all notifications are marked as read instead'})
  @IsBoolean()
  @IsOptional()
  all?: boolean
}
