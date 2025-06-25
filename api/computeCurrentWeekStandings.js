function computeCurrentWeekStandings(matchesData) {
  const standings = {};

  // ✅ Go through *all* weeks, not just the latestDay
  for (const day of matchesData) {
    for (const match of day.matches) {
      const home = match.homeTeamName;
      const away = match.awayTeamName;
      const homeGoals = match.homeScore;
      const awayGoals = match.awayScore;

      let homeResult = "D",
        awayResult = "D";
      if (homeGoals > awayGoals) {
        homeResult = "W";
        awayResult = "L";
      } else if (homeGoals < awayGoals) {
        homeResult = "L";
        awayResult = "W";
      }

      updateTeam(home, homeGoals, awayGoals, homeResult);
      updateTeam(away, awayGoals, homeGoals, awayResult);
    }
  }

  function updateTeam(team, scored, conceded, result) {
    if (!standings[team]) {
      standings[team] = { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, PTS: 0 };
    }
    standings[team].P += 1;
    standings[team].GF += scored;
    standings[team].GA += conceded;
    standings[team].GD = standings[team].GF - standings[team].GA;

    if (result === "W") {
      standings[team].W += 1;
      standings[team].PTS += 3;
    } else if (result === "D") {
      standings[team].D += 1;
      standings[team].PTS += 1;
    } else {
      standings[team].L += 1;
    }
  }

  const sortedTable = Object.entries(standings)
    .map(([team, stats]) => ({ team, ...stats }))
    .sort((a, b) => {
      if (b.PTS !== a.PTS) return b.PTS - a.PTS;
      if (b.GD !== a.GD) return b.GD - a.GD;
      return b.GF - a.GF;
    });

  // ✅ Return the *latest* week number
  const latestDay = matchesData[matchesData.length - 1];
  return [latestDay.number, sortedTable];
}

module.exports = { computeCurrentWeekStandings };
