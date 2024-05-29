import { Inject, Injectable } from '@nestjs/common';
import { EXTENDED_PRISMA_SERVICE } from '../database/db.constants';
import { ExtendedPrismaService } from '../database/prisma.extension';
import { Cron } from '@nestjs/schedule';
import { createClient } from 'redis';
import { LeaderboardType } from '@momentum/constants';
import { XpSystemsService } from '../xp-systems/xp-systems.service';

Injectable()
export class RanksService {
  constructor(
    @Inject(EXTENDED_PRISMA_SERVICE) private readonly db: ExtendedPrismaService,
    private readonly xp: XpSystemsService
  ) {}

  @Cron('* * * * *')
  async updateRanks() {
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

    const users: {[id: string]: [number, number, number, number, number, number, number, number, number, number, number, number]} = {};
    for (const lb of lbs) {
      const sortedRuns = lb.runs.sort((a, b) => a.time - b.time);
      let rank = 1;
      const completions = sortedRuns.length;
      for (const run of sortedRuns) {
        const pts = this.xp.getRankXpForRank(rank, completions);
        if (!(`user:${run.userID}` in users)) {
          users[`user:${run.userID}`] = [0,0,0,0,0,0,0,0,0,0,0,0];
        }
        users[`user:${run.userID}`][run.gamemode] += pts.rankXP;
        rank++;
      }
    }
    const userRanks: {[id: string]: [number, number, number, number, number, number, number, number, number, number, number, number]} = {};
    const userIDs: string[] = [];
    for (const uid in users) {
      userIDs.push(uid);
    }
    const sortedUsers: string[][] = [[], [], [], [], [], [], [], [], [], [], [], []];
    for (const gamemode of [1, 2, 4, 5, 7, 9, 10, 11]) {
      sortedUsers[gamemode].push(...userIDs.filter((x) => users[x][gamemode] > 0)
        .sort((a, b) => users[b][gamemode] - users[a][gamemode]));
      let rank = 1;
      for (const u in sortedUsers) {
        if (!(u in userRanks)) {
          userRanks[u] = [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1];
        }
        userRanks[u][gamemode] = rank;
        rank++;
      }
    }
    const t2_sortingDone = Date.now();
    console.log(`Sorting done. Pushing to redis... (${t2_sortingDone-t0}ms)`);
    await rb.executeIsolated(async (rbtx) => {
      for (const gamemode of [1, 2, 4, 5, 7, 9, 10, 11]) {
        let rank = 1;
        for (const usr of sortedUsers[gamemode]) {
          await rbtx.set(`rank:${gamemode}:${rank}`, usr);
          rank++;
        }
      }
      for (const user of userIDs) {
        await rbtx.hSet(user,
          {'gamemode:1': users[user][1], 'gamemode:2': users[user][2],
          'gamemode:4': users[user][4], 'gamemode:5': users[user][5],
          'gamemode:7': users[user][7], 'gamemode:9': users[user][9],
          'gamemode:10': users[user][10], 'gamemode:11': users[user][11]
          // 'rank:1': userRanks[user][1], 'rank:2': userRanks[user][2],
          // 'rank:4': userRanks[user][4], 'rank:5': userRanks[user][5],
          // 'rank:7': userRanks[user][7], 'rank:9': userRanks[user][9],
          // 'rank:10': userRanks[user][10], 'rank:11': userRanks[user][11]
        });
      }
    });
    await rb.quit();
    const t2 = Date.now();
    console.log(`Pushed to redis. (${t2-t2_sortingDone}ms)`)
    console.log(`Whole thing took ${t2-t0}ms`);
  }
}
