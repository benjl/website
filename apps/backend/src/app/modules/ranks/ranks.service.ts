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

    const rb = await createClient() // This should be its own module like prisma with env vars and more than just stock redis setup
      .on('error', err => { throw new Error('Error connecting to redis server.') })
      .connect();

    console.log('Loading runs from db...');
    const lbs = await this.db.leaderboard.findMany({ // Can we get away with loading EVERY point-giving leaderboard and run in memory at once?
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
      const sortedRuns = lb.runs.sort((a, b) => a.time - b.time); // This should still be done with window functions in the future i guess
      let rank = 1;
      const completions = sortedRuns.length;
      for (const run of sortedRuns) {
        const pts = this.xp.getRankXpForRank(rank, completions);
        if (!(`user:${run.userID}` in userPoints)) {
          userPoints[`user:${run.userID}`] = {1: 0, 2: 0, 4: 0, 5: 0, 7: 0, 9: 0, 10: 0, 11: 0}; // get user:[userID] to see the user's rank pts
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
          userRanks[user] = {1: -1, 2: -1, 4: -1, 5: -1, 7: -1, 9: -1, 10: -1, 11: -1}; // Get rank:[gamemode]:[rank] to see who is that rank
        }
        userRanks[user][gamemode] = rank;
        rank++;
      }
    }

    const t2_sortingDone = Date.now();
    console.log(`Sorting done. Pushing to redis... (${t2_sortingDone-t1}ms)`);
    await rb.executeIsolated(async (rbtx) => { // Avoids latency of sending one thing and waiting for a reply before the next thing
      await rbtx.flushDb(); // Start from a blank slate (all this is a transaction so delete won't go thru if smth fails)
      const promises: any[] = []; // Updating every key is probably a better idea, deleted users would be left hanging tho
      for (const user in userPoints) {
        promises.push(rbtx.hSet(user,
          {'gamemode:1': userPoints[user][1], 'gamemode:2': userPoints[user][2],
          'gamemode:4': userPoints[user][4], 'gamemode:5': userPoints[user][5],
          'gamemode:7': userPoints[user][7], 'gamemode:9': userPoints[user][9],
          'gamemode:10': userPoints[user][10], 'gamemode:11': userPoints[user][11],
            'rank:1': userRanks[user][1], 'rank:2': userRanks[user][2],
            'rank:4': userRanks[user][4], 'rank:5': userRanks[user][5],
            'rank:7': userRanks[user][7], 'rank:9': userRanks[user][9],
            'rank:10': userRanks[user][10], 'rank:11': userRanks[user][11]
        })); // Doing these all in parallel is more than 100x faster than doing it normally.
      }
      for (const user in userRanks) {
        for (const gamemode of gamemodeArray) {
          if (userRanks[user][gamemode] !== -1) {
            promises.push(rbtx.set(`rank:${gamemode}:${userRanks[user][gamemode]}`, user));
          }
        }
      }
      await Promise.all(promises); // 34,000 of these takes ~200ms on my laptop.
    }); // Worst case is (number of users * (gamemodes + 1)) records i think, dunno how the time taken scales
    await rb.quit();
    const t2 = Date.now();
    console.log(`Pushed to redis. (${t2-t2_sortingDone}ms)`)
    console.log(`Whole thing took ${t2-t0}ms`);
  }
}
