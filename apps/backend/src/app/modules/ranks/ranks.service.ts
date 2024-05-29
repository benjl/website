import { Inject, Injectable } from '@nestjs/common';
import { EXTENDED_PRISMA_SERVICE } from '../database/db.constants';
import { ExtendedPrismaService } from '../database/prisma.extension';
import { Cron } from '@nestjs/schedule';
import { createClient } from 'redis';
import { Gamemode, LeaderboardType } from '@momentum/constants';
import { XpSystemsService } from '../xp-systems/xp-systems.service';

Injectable()
export class RanksService {
  constructor(
    @Inject(EXTENDED_PRISMA_SERVICE) private readonly db: ExtendedPrismaService,
    private readonly xp: XpSystemsService
  ) {}

  @Cron('* * * * *')
  async updateRanks() {
    const gamemodeArray = [Gamemode.SURF, Gamemode.BHOP, Gamemode.RJ, Gamemode.SJ,
      Gamemode.AHOP, Gamemode.CONC, Gamemode.DEFRAG_CPM, Gamemode.DEFRAG_VQ3];
    // const leaderboardKey = (l: Leaderboard) => 'leaderboard:' + [l.mapID, l.gamemode, l.trackType, l.trackNum, l.style].join(':');
    // const runKey = (r: LeaderboardRun) => 'run:' + [r.userID, r.gamemode, r.style, r.mapID, r.trackType, r.trackNum].join(':');

    const t0 = Date.now();
    console.log('Updating ranks...');

    const rb = await createClient()
      .on('error', err => console.error('Redis Client Error', err))
      .connect();

    console.log('Loading runs from db...');
    const lbs = await this.db.leaderboard.findMany({
      where: {
        type: LeaderboardType.RANKED,
        trackType: 0
      },
      select: {
        runs: true,
        gamemode: true,
        trackType: true,
        trackNum: true,
        mapID: true
      }
    });

    const t1 = Date.now();
    console.log(`Runs loaded. Ranking players...(${t1-t0}ms)`);
    const userPoints: {[id: string]: {[K in Gamemode]: number}} = {};
    for (const lb of lbs) {
      const sortedRuns = lb.runs.sort((a, b) => a.time - b.time);
      let rank = 1;
      const completions = sortedRuns.length;
      for (const run of sortedRuns) {
        const pts = this.xp.getRankXpForRank(rank, completions);
        if (!(`user:${run.userID}` in userPoints)) {
          userPoints[`user:${run.userID}`] = {1: 0, 2: 0, 4: 0, 5: 0, 7: 0, 9: 0, 10: 0, 11: 0};
        }
        userPoints[`user:${run.userID}`][run.gamemode] += pts.rankXP;
        rank++;
      }
    }
    const rankedUserIDs: string[] = [];
    for (const userID in userPoints) {
      rankedUserIDs.push(userID);
    }
    const userRanks: {[id: string]: {[K in Gamemode]: number}} = {};
    for (const gamemode of gamemodeArray) {
      const rankedUsers: string[] = rankedUserIDs.filter((x) => userPoints[x][gamemode] > 0)
        .sort((a, b) => userPoints[b][gamemode] - userPoints[a][gamemode]);
      let rank = 1;
      for (const user of rankedUsers) {
        if (!(user in userRanks)) {
          userRanks[user] = {1: -1, 2: -1, 4: -1, 5: -1, 7: -1, 9: -1, 10: -1, 11: -1};
        }
        userRanks[user][gamemode] = rank;
        rank++;
      }
    }

    const t2_sortingDone = Date.now();
    console.log(`Sorting done. Pushing to redis... (${t2_sortingDone-t1}ms)`);
    await rb.executeIsolated(async (rbtx) => {
      await rbtx.flushDb();
      const promises: any[] = [];
      for (const user in userPoints) {
        promises.push(rbtx.hSet(user,
          {'gamemode:1': userPoints[user][1], 'gamemode:2': userPoints[user][2],
          'gamemode:4': userPoints[user][4], 'gamemode:5': userPoints[user][5],
          'gamemode:7': userPoints[user][7], 'gamemode:9': userPoints[user][9],
          'gamemode:10': userPoints[user][10], 'gamemode:11': userPoints[user][11]
        }));
      }
      for (const user in userRanks) {
        for (const gamemode of gamemodeArray) {
          if (userRanks[user][gamemode] !== -1) {
            promises.push(rbtx.set(`rank:${gamemode}:${userRanks[user][gamemode]}`, user));
          }
        }
      }
      await Promise.all(promises);
    });
    await rb.quit();
    const t2 = Date.now();
    console.log(`Pushed to redis. (${t2-t2_sortingDone}ms)`)
    console.log(`Whole thing took ${t2-t0}ms`);
  }
}
