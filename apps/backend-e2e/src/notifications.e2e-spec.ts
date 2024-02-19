// noinspection DuplicatedCode

import { DbUtil, RequestUtil } from '@momentum/test-utils';
import { PrismaClient } from '@prisma/client';

import {
  setupE2ETestEnvironment,
  teardownE2ETestEnvironment
} from './support/environment';
import { MapStatusNew, NotificationType } from '@momentum/constants';
import { NotificationDto } from 'apps/backend/src/app/dto';

describe('Notifications', () => {
  let app, prisma: PrismaClient, req: RequestUtil, db: DbUtil;
  let user, userToken, map, user2;

  beforeAll(async () => {
    const env = await setupE2ETestEnvironment();
    app = env.app;
    prisma = env.prisma;
    req = env.req;
    db = env.db;
  });

  afterAll(async () => await teardownE2ETestEnvironment(app));

  beforeEach(async () => {
    [user, userToken] = await db.createAndLoginUser();
    user2 = await db.createUser();
    map = await db.createMap({
      name: 'the_map_hard_version',
      submitter: { connect: { id: user2.id } },
      status: MapStatusNew.PRIVATE_TESTING
    });
    // In the future, announcements won't ever be in db
    // they will just get pushed directly to user
    // these are here for testing purposes
    await prisma.notification.createMany({
      data: [
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'Game will explode in 10 minutes'
        },
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'nvm game is fine'
        },
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'web dev needed urgently'
        },
        {
          targetUserID: user.id,
          type: NotificationType.MAP_TESTING_REQUEST,
          mapID: map.id,
          userID: user2.id
        },
        {
          targetUserID: user2.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'this is just for u <3'
        }
      ]
    });
  });

  afterEach(() => db.cleanup('notification', 'mMap', 'user'));

  describe('notifications/ GET', () => {
    it('should get a list of notifications', async () => {
      const notifs = await req.get({
        url: 'notifications',
        status: 200,
        validateArray: NotificationDto,
        token: userToken
      });
      expect(notifs.body).toMatchObject([
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'Game will explode in 10 minutes'
        },
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'nvm game is fine'
        },
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'web dev needed urgently'
        },
        {
          targetUserID: user.id,
          type: NotificationType.MAP_TESTING_REQUEST,
          mapID: map.id,
          userID: user2.id
        }
      ]);
    });

    it('should 401 when no access token is provided', () =>
      req.unauthorizedTest('notifications', 'get'));
  });

  describe('notifications/markAsRead DELETE', () => {
    it('should delete a list of notifications', async () => {
      const notifs = await prisma.notification.findMany({
        where: {
          targetUserID: user.id
        }
      });

      const toDelete = [notifs[0].id, notifs[1].id];

      await req.del({
        url: 'notifications/markAsRead',
        status: 204,
        query: { notifIDs: toDelete.join(',') },
        token: userToken
      });

      const newNotifs = await prisma.notification.findMany({
        where: {
          targetUserID: user.id
        }
      });

      expect(newNotifs).toMatchObject([
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'web dev needed urgently'
        },
        {
          targetUserID: user.id,
          type: NotificationType.MAP_TESTING_REQUEST,
          mapID: map.id,
          userID: user2.id
        }
      ]);
    });
    it('should not delete a map testing request notification', async () => {
      const notif = await prisma.notification.findFirst({
        where: {
          targetUserID: user.id,
          type: NotificationType.MAP_TESTING_REQUEST
        }
      });

      await req.del({
        url: 'notifications/markAsRead',
        status: 204,
        query: { notifIDs: notif.id.toString() },
        token: userToken
      });

      const notifs = await prisma.notification.findMany({
        where: {
          targetUserID: user.id
        }
      });

      expect(notifs).toMatchObject([
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'Game will explode in 10 minutes'
        },
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'nvm game is fine'
        },
        {
          targetUserID: user.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'web dev needed urgently'
        },
        {
          targetUserID: user.id,
          type: NotificationType.MAP_TESTING_REQUEST,
          mapID: map.id,
          userID: user2.id
        }
      ]);
    });

    it('should not delete a notification targeting another user', async () => {
      const notif = await prisma.notification.findFirst({
        where: {
          targetUserID: user2.id
        }
      });
      await req.del({
        url: 'notifications/markAsRead',
        status: 204,
        query: { notifIDs: notif.id.toString() },
        token: userToken
      });

      const newNotifs = await prisma.notification.findMany({
        where: {
          targetUserID: user2.id
        }
      });

      expect(newNotifs).toMatchObject([
        {
          targetUserID: user2.id,
          type: NotificationType.ANNOUNCEMENT,
          message: 'this is just for u <3'
        }
      ]);
    });

    it('should delete all non-testing request notifications', async () => {
      await req.del({
        url: 'notifications/markAsRead',
        status: 204,
        query: { notifIDs: 'all' },
        token: userToken
      });

      const notifs = await prisma.notification.findMany({
        where: {
          targetUserID: user.id
        }
      });

      expect(notifs).toMatchObject([
        {
          targetUserID: user.id,
          type: NotificationType.MAP_TESTING_REQUEST,
          mapID: map.id,
          userID: user2.id
        }
      ]);
    });

    it('should 400 if not given a list of notification ids or "all"', async () => {
      await req.del({
        url: 'notifications/markAsRead',
        status: 400,
        query: { notifIDs: '2,119,bob,1137' },
        token: userToken
      });
      await req.del({
        url: 'notifications/markAsRead',
        status: 400,
        query: { notifIDs: 'awl' },
        token: userToken
      });
      await req.del({
        url: 'notifications/markAsRead',
        status: 400,
        query: { notTheRightQuery: '123,456' },
        token: userToken
      });
    });

    it('should 401 when no access token is provided', () =>
      req.unauthorizedTest('notifications/markAsRead', 'del'));
  });
});
