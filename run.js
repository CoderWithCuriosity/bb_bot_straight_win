const fs = require("fs");
const path = require("path");
const { fetchFullTournamentData } = require("./api/fetchFullTournamentData");

const STRATEGIC_TOURNAMENTS = [
  { id: "vf:tournament:31867", name: "English League" },
  { id: "vf:tournament:14149", name: "League Mode" },
  { id: "vf:tournament:34616", name: "Bundesliga" }
];

async function saveHistoricalMatchData() {
  const allData = [];

  for (const tournament of STRATEGIC_TOURNAMENTS) {
    console.log(`📥 Fetching: ${tournament.name}...`);

    const weeks = await fetchFullTournamentData(tournament.id);

    if (!weeks || !weeks.length) {
      console.log(`⚠️ No data for ${tournament.name}`);
      continue;
    }

    for (const week of weeks) {
      const weekData = {
        tournament: tournament.name,
        week: week.number,
        date: week.scheduleDate,
        matches: week.matches.map(match => ({
          home: match.homeTeamName,
          away: match.awayTeamName,
          homeScore: match.homeScore,
          awayScore: match.awayScore
        }))
      };
      allData.push(weekData);
    }
  }

  const outputPath = path.join(__dirname, "history.json");
  fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2));
  console.log(`✅ Data saved to ${outputPath}`);
}

saveHistoricalMatchData();
