import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { LoggedInUser } from '../../decorators';
import { NotificationDto, NotifsMarkAsReadQueryDto } from '../../dto';

@Controller('notifications')
@ApiTags('Notifications')
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notifsService: NotificationsService) {}

  @Get('/')
  @ApiOperation({ description: 'Fetches the notifications sent to a user.' })
  @ApiOkResponse({ description: "List of the user's notifications." })
  async getNotifications(
    @LoggedInUser('id') userID: number
  ): Promise<NotificationDto[]> {
    return this.notifsService.getNotifications(userID);
  }

  @Delete('/markAsRead')
  @ApiOperation({ description: 'Marks the given notifications as read.' })
  // TODO: Query decorator?
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Notifications marked as read successfully'
  })
  @ApiBadRequestResponse({ description: 'Invalid notifIDs' })
  async markNotificationsAsRead(
    @LoggedInUser('id') userID: number,
    @Query() query: NotifsMarkAsReadQueryDto
  ): Promise<void> {
    // console.log(JSON.stringify(query));
    return this.notifsService.markAsRead(userID, query);
  }
}
