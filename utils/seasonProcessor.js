// utils/seasonProcessor.js

const { fetchFullTournamentData } = require("../api/fetchFullTournamentData");
const {
  computeCurrentWeekStandings
} = require("../api/computeCurrentWeekStandings");
const {
  createTeam,
  simulateMatch,
  saveTournament,
  updateTeamStanding
} = require("../utils/league");
const fs = require("fs");
const path = require("path");

const STRATEGIC_TOURNAMENTS = require("../config/strategicTournaments");

const TEAM_STORE = {};

async function processSeasonsFromWeek1() {
  for (const tournament of STRATEGIC_TOURNAMENTS) {
    const [seasonId, weeks] = await fetchFullTournamentData(tournament.id);
    if (!weeks || weeks.length === 0) continue;

    // Initialize team names from week 1
    const allTeams = new Set();
    for (const match of weeks[0].matches) {
      allTeams.add(match.homeTeamName);
      allTeams.add(match.awayTeamName);
    }

    if (!TEAM_STORE[tournament.id]) TEAM_STORE[tournament.id] = {};
    if (!TEAM_STORE[tournament.id][seasonId]) {
      TEAM_STORE[tournament.id][seasonId] = {};
      for (const teamName of allTeams) {
        TEAM_STORE[tournament.id][seasonId][teamName] = createTeam(teamName);
      }
    }

    // 🟢 Loop starts from Week 1
    for (let i = 0; i < weeks.length; i++) {
      const weekNumber = i + 1;
      const weekMatches = weeks[i].matches;

      for (const match of weekMatches) {
        const teamA = TEAM_STORE[tournament.id][seasonId][match.homeTeamName];
        const teamB = TEAM_STORE[tournament.id][seasonId][match.awayTeamName];
        if (!teamA || !teamB) continue;

        simulateMatch(teamA, teamB, match.homeScore, match.awayScore);
      }

      // 📊 After week matches, calculate and record standings
      const [_, standings] = computeCurrentWeekStandings(weeks.slice(0, i + 1));

      for (let j = 0; j < standings.length; j++) {
        const teamName = standings[j].team;
        const position = j + 1;

        const team = TEAM_STORE[tournament.id][seasonId][teamName];
        if (team) {
          updateTeamStanding(team, weekNumber, position);
        }
      }
    }

    const teams = Object.values(TEAM_STORE[tournament.id][seasonId]);
    saveTournament(tournament.id, tournament.name, seasonId, teams);

    const [latestWeek, finalStandings] = computeCurrentWeekStandings(weeks);
    saveStanding(tournament.id, seasonId, latestWeek, finalStandings);

    console.log(`✅ Processed ${tournament.name} — Weeks: ${weeks.length}`);
  }
}

function saveStanding(tournamentId, seasonId, week, standings) {
  const file = path.join(__dirname, "../season_standings.json");
  let data = [];

  if (fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, "utf-8"));
  }

  let tournament = data.find(t => t.tournamentId === tournamentId);
  if (!tournament) {
    tournament = { tournamentId, seasons: [] };
    data.push(tournament);
  }

  let season = tournament.seasons.find(s => s.seasonId === seasonId);
  if (!season) {
    season = { seasonId, latestWeek: week, standings: [] };
    tournament.seasons.push(season);
  }

  season.latestWeek = week;
  season.standings = standings;

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// processSeasonsFromWeek1();

module.exports = { processSeasonsFromWeek1 };
