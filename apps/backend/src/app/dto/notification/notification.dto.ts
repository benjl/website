import { Notification, NotificationType } from '@momentum/constants';
import {
  CreatedAtProperty,
  EnumProperty,
  IdProperty,
  NestedProperty
} from '../decorators';
import { UserDto } from '../user/user.dto';
import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MapDto } from '../map/map.dto';
import { PastRunDto } from '../run/past-run.dto';

export class NotificationDto implements Notification {
  @IdProperty()
  readonly id: number;

  @EnumProperty(NotificationType)
  readonly type: NotificationType;

  @IdProperty({
    description: 'The ID of the user that the notification is sent to'
  })
  readonly targetUserID: number;

  @NestedProperty(UserDto)
  readonly targetUser: UserDto;

  @ApiProperty({
    description: 'The text of the announcement notification'
  })
  @IsOptional()
  @IsString()
  readonly message: string;

  @IdProperty({
    description:
      'The ID of the user that achieved the wr or sent the map testing request',
    required: false
  })
  readonly userID: number;

  @NestedProperty(UserDto)
  @IsOptional()
  readonly user: UserDto;

  @IdProperty({
    description:
      'The ID of the map that the testing request is about or the map that changed status',
    required: false
  })
  readonly mapID: number;

  @NestedProperty(MapDto)
  @IsOptional()
  readonly map: MapDto;

  @IdProperty({
    description: 'The ID of the PastRun that has just been achieved',
    required: false
  })
  readonly runID: bigint;

  @NestedProperty(PastRunDto)
  @IsOptional()
  readonly run: PastRunDto;

  @CreatedAtProperty()
  readonly createdAt: Date;
}
