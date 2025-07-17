const fs = require("fs");
const path = require("path");
const { getMatchOdds } = require("../../api/matches");
const { DateTime } = require("luxon");

function loadBets() {
  const filePath = path.join(__dirname, "./data.json");
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

  let endedCount = 0;
  let over1_5 = 0;
  let over2_5 = 0;
  let over3_5 = 0;
  let under1 = 0;
  let draws = 0;
  let drawTeams = [];

  for (const result of results) {
    if (!result) continue;

    const { matchData } = result;

    if (!matchData) continue;

    const { homeScore, awayScore, matchStatus, name, id } = matchData;

    if (matchStatus !== "ended") continue;

    endedCount++;

    const totalGoals = homeScore + awayScore;

    if (totalGoals > 1.5) over1_5++;
    if (totalGoals > 2.5) over2_5++;
    if (totalGoals > 3.5) over3_5++;
    if (totalGoals < 1) under1++;
    if (homeScore === awayScore) {
      drawTeams.push({ name: name, id: id });
      draws++;
    }
  }

  console.log(`\n📊 Finished Matches: ${endedCount}`);
  console.log(`✅ Over 1.5: ${over1_5}`);
  console.log(`✅ Over 2.5: ${over2_5}`);
  console.log(`✅ Over 3.5: ${over3_5}`);
  console.log(`❌ Under 1 Goal (0-0): ${under1}`);
  console.log(`Draws: ${draws}`);
  //   console.log(`Draw Matches Teams: ${drawTeams}`);
  fs.writeFileSync("draws.json", JSON.stringify(drawTeams, null, 2));
}

countFinishedMatches(false);
