const fs = require("fs");
const path = require("path");
const { getMatchOdds } = require("../../api/matches");
const { DateTime } = require("luxon");

function loadBets() {
  const filePath = path.join(__dirname, "../../bets.json");
  const rawData = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(rawData);
}

async function countFinishedMatches(useCurrentHour = false) {
  const allBets = loadBets();

  let filteredBets = allBets;

  if (useCurrentHour) {
    const currentHour = DateTime.local().hour;
    filteredBets = allBets.filter(bet => {
      const betHour = DateTime.fromISO(bet.placedAt).hour;
      return betHour === currentHour;
    });
  }

  const promises = filteredBets.map(bet => {
    return getMatchOdds(bet.eventId)
      .then(matchData => ({ bet, matchData }))
      .catch(err => {
        console.log(`❌ Error fetching data for ${bet.name}`);
        return null;
      });
  });

  const results = await Promise.all(promises);

  // Initialize counters
  let endedCount = 0;
  let stats = {
    goals: {
      over0_5: 0,
      over1_5: 0,
      over2_5: 0,
      over3_5: 0,
      under1_5: 0,
      under2_5: 0,
      under3_5: 0,
      exact0: 0,
      exact1: 0,
      exact2: 0,
      exact3: 0,
      exact4: 0
    },
    outcomes: {
      homeWins: 0,
      awayWins: 0,
      draws: 0,
      homeOrDraw: 0,
      awayOrDraw: 0,
      homeOrAway: 0
    },
    halves: {
      homeWinsBothHalves: 0,
      awayWinsBothHalves: 0,
      homeWinsEitherHalf: 0,
      awayWinsEitherHalf: 0,
      cleanSheetHome: 0,
      cleanSheetAway: 0
    },
    specials: {
      winToNilHome: 0,
      winToNilAway: 0
    },
    fullTime: {
      bothTeamsScore: 0
    }
  };

  let detailedResults = {
    highScoring: [],
    lowScoring: [],
    cleanSheets: [],
    bothTeamsScored: []
  };

  let matchWinners = [];
  let finishedMatches = [];

  for (const result of results) {
    if (!result) continue;
    const { matchData } = result;
    if (!matchData) continue;

    const { homeScore, awayScore, matchStatus, name, id, periodScores, homeTeamName, awayTeamName } = matchData;
    if (matchStatus !== "ended") continue;

    endedCount++;

    const [homeTeam, awayTeam] = [homeTeamName, awayTeamName];

    let winnerText = "";
    if (homeScore > awayScore) {
      winnerText = `🏆 ${homeTeam} WON (${homeScore}-${awayScore})`;
    } else if (awayScore > homeScore) {
      winnerText = `🏆 ${awayTeam} WON (${homeScore}-${awayScore})`;
    } else {
      winnerText = `🤝 DRAW (${homeScore}-${awayScore})`;
    }

    console.log(`${homeTeam} vs ${awayTeam} → ${winnerText}`);

    // Save match winners
    matchWinners.push({
      id,
      match: name,
      homeScore,
      awayScore,
      result: winnerText
    });

    // Save finished matches (all with scores)
    finishedMatches.push({
      id,
      match: name,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      result: winnerText
    });

    const totalGoals = homeScore + awayScore;

    // Goals statistics
    if (totalGoals > 0.5) stats.goals.over0_5++;
    if (totalGoals > 1.5) stats.goals.over1_5++;
    if (totalGoals > 2.5) stats.goals.over2_5++;
    if (totalGoals > 3.5) stats.goals.over3_5++;
    if (totalGoals < 1.5) stats.goals.under1_5++;
    if (totalGoals < 2.5) stats.goals.under2_5++;
    if (totalGoals < 3.5) stats.goals.under3_5++;

    if (totalGoals === 0) stats.goals.exact0++;
    if (totalGoals === 1) stats.goals.exact1++;
    if (totalGoals === 2) stats.goals.exact2++;
    if (totalGoals === 3) stats.goals.exact3++;
    if (totalGoals === 4) stats.goals.exact4++;

    // Match outcomes
    if (homeScore > awayScore) {
      stats.outcomes.homeWins++;
      stats.outcomes.homeOrDraw++;
      stats.outcomes.homeOrAway++;
    } else if (awayScore > homeScore) {
      stats.outcomes.awayWins++;
      stats.outcomes.awayOrDraw++;
      stats.outcomes.homeOrAway++;
    } else {
      stats.outcomes.draws++;
      stats.outcomes.homeOrDraw++;
      stats.outcomes.awayOrDraw++;
    }

    // Halves analysis
    try {
      const periods = periodScores ? JSON.parse(periodScores) : [];
      const firstHalf = periods.find(p => p.periodNumber === 1);
      const secondHalf = periods.find(p => p.periodNumber === 2);

      if (firstHalf && secondHalf) {
        if (firstHalf.homeScore > firstHalf.awayScore &&
            secondHalf.homeScore > secondHalf.awayScore) {
          stats.halves.homeWinsBothHalves++;
        }
        if (firstHalf.awayScore > firstHalf.homeScore &&
            secondHalf.awayScore > secondHalf.homeScore) {
          stats.halves.awayWinsBothHalves++;
        }

        if (firstHalf.homeScore > firstHalf.awayScore ||
            secondHalf.homeScore > secondHalf.awayScore) {
          stats.halves.homeWinsEitherHalf++;
        }
        if (firstHalf.awayScore > firstHalf.homeScore ||
            secondHalf.awayScore > secondHalf.homeScore) {
          stats.halves.awayWinsEitherHalf++;
        }
      }
    } catch (e) {
      console.log(`Error parsing period scores for ${name}`);
    }

    // Both Teams to Score (GG)
    if (homeScore > 0 && awayScore > 0) {
      stats.fullTime.bothTeamsScore++;
      detailedResults.bothTeamsScored.push({ name, id, score: `${homeScore}-${awayScore}` });
    }

    // Clean Sheets
    if (awayScore === 0) stats.halves.cleanSheetHome++;
    if (homeScore === 0) stats.halves.cleanSheetAway++;

    // Specials
    if (homeScore > awayScore && awayScore === 0) {
      stats.specials.winToNilHome++;
    }
    if (awayScore > homeScore && homeScore === 0) {
      stats.specials.winToNilAway++;
    }

    // Detailed tracking
    if (totalGoals >= 4) {
      detailedResults.highScoring.push({ name, id, score: `${homeScore}-${awayScore}` });
    }
    if (totalGoals <= 1) {
      detailedResults.lowScoring.push({ name, id, score: `${homeScore}-${awayScore}` });
    }
    if (homeScore === 0 && awayScore === 0) {
      detailedResults.cleanSheets.push({ name, id });
    }
  }

  // Print summary statistics
  console.log(`\n📊 Finished Matches Analyzed: ${endedCount}`);

  console.log("\n⚽ Goals Statistics:");
  console.log(`✅ Over 0.5 Goals: ${stats.goals.over0_5} (${((stats.goals.over0_5/endedCount)*100).toFixed(1)}%)`);
  console.log(`✅ Over 1.5 Goals: ${stats.goals.over1_5} (${((stats.goals.over1_5/endedCount)*100).toFixed(1)}%)`);
  console.log(`✅ Over 2.5 Goals: ${stats.goals.over2_5} (${((stats.goals.over2_5/endedCount)*100).toFixed(1)}%)`);
  console.log(`✅ Over 3.5 Goals: ${stats.goals.over3_5} (${((stats.goals.over3_5/endedCount)*100).toFixed(1)}%)`);
  console.log(`🔻 Under 0.5 Goals (0-0): ${stats.goals.exact0} (${((stats.goals.exact0/endedCount)*100).toFixed(1)}%)`);
  console.log(`🔻 Under 1.5 Goals: ${stats.goals.under1_5} (${((stats.goals.under1_5/endedCount)*100).toFixed(1)}%)`);
  console.log(`🔻 Under 2.5 Goals: ${stats.goals.under2_5} (${((stats.goals.under2_5/endedCount)*100).toFixed(1)}%)`);

  console.log("\n🏆 Match Outcomes:");
  console.log(`🔴 Home Wins: ${stats.outcomes.homeWins} (${((stats.outcomes.homeWins/endedCount)*100).toFixed(1)}%)`);
  console.log(`🔵 Away Wins: ${stats.outcomes.awayWins} (${((stats.outcomes.awayWins/endedCount)*100).toFixed(1)}%)`);
  console.log(`⚪ Draws: ${stats.outcomes.draws} (${((stats.outcomes.draws/endedCount)*100).toFixed(1)}%)`);

  console.log(`\n✅ Both Teams Scored (FT): ${stats.fullTime.bothTeamsScore} (${((stats.fullTime.bothTeamsScore/endedCount)*100).toFixed(1)}%)`);

  console.log("\n⏱️ Halves Analysis:");
  console.log(`🔴 Home Wins Both Halves: ${stats.halves.homeWinsBothHalves}`);
  console.log(`🔵 Away Wins Both Halves: ${stats.halves.awayWinsBothHalves}`);
  console.log(`🔴 Home Wins Either Half: ${stats.halves.homeWinsEitherHalf}`);
  console.log(`🔵 Away Wins Either Half: ${stats.halves.awayWinsEitherHalf}`);
  console.log(`🛡️ Home Clean Sheets: ${stats.halves.cleanSheetHome}`);
  console.log(`🛡️ Away Clean Sheets: ${stats.halves.cleanSheetAway}`);

  console.log("\n🎯 Special Markets:");
  console.log(`🔴 Home Win to Nil: ${stats.specials.winToNilHome}`);
  console.log(`🔵 Away Win to Nil: ${stats.specials.winToNilAway}`);

  // Save results to files
  fs.writeFileSync("detailed_stats.json", JSON.stringify({ summary: stats, detailedResults }, null, 2));
  fs.writeFileSync("high_scoring_matches.json", JSON.stringify(detailedResults.highScoring, null, 2));
  fs.writeFileSync("low_scoring_matches.json", JSON.stringify(detailedResults.lowScoring, null, 2));
  fs.writeFileSync("both_teams_scored.json", JSON.stringify(detailedResults.bothTeamsScored, null, 2));
  fs.writeFileSync("clean_sheets.json", JSON.stringify(detailedResults.cleanSheets, null, 2));
  fs.writeFileSync("match_winners.json", JSON.stringify(matchWinners, null, 2));
  fs.writeFileSync("finished_matches.json", JSON.stringify(finishedMatches, null, 2));
}

countFinishedMatches(false);
