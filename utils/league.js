const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../tournament_data.json');

function normalize(value) {
  return Math.max(0, Math.min(10, parseFloat(value.toFixed(2))));
}

function createTeam(name) {
  return {
    name,
    attack: 5.0,
    defense: 5.0,
    strength: 5.0,
    chaos: 5.0,
    form: [], // 'W', 'L', 'D'
    standings: [] // [{ week: 1, position: 5 }]
  };
}

function simulateMatch(teamA, teamB, goalsA, goalsB) {
  const resultA = goalsA > goalsB ? 'W' : goalsA < goalsB ? 'L' : 'D';
  const resultB = goalsB > goalsA ? 'W' : goalsB < goalsA ? 'L' : 'D';

  updateTeamStats(teamA, resultA, goalsA, goalsB, teamB);
  updateTeamStats(teamB, resultB, goalsB, goalsA, teamA);
}

function updateTeamStats(team, result, goalsFor, goalsAgainst, opponent) {
  team.form.push(result);
  if (team.form.length > 5) team.form.shift();

  // Attack
  if (goalsFor >= 3) {
    team.attack += 0.5;
  } else if (goalsFor === 2) {
    team.attack += 0.3;
  } else if (goalsFor === 1) {
    team.attack += opponent.defense >= 7.5 ? 0 : -0.1;
  } else {
    team.attack -= 0.4;
  }

  // Defense
  if (goalsAgainst === 0) {
    team.defense += 0.4;
  } else if (goalsAgainst === 1) {
    team.defense -= 0.1;
  } else {
    team.defense -= 0.3;
  }

  // Strength
  if (result === 'W') {
    team.strength += opponent.strength > team.strength ? 0.6 : 0.3;
  } else if (result === 'L') {
    team.strength -= opponent.strength < team.strength ? 0.5 : 0.3;
  } else {
    team.strength += opponent.strength > team.strength ? 0.2 : -0.2;
  }

  // Chaos (volatile without randomness)
  const isUnderdog = (team.attack + team.strength) < (opponent.attack + opponent.strength);
  const gotLuckyWin = result === 'W' && isUnderdog;
  const wasUnfairDraw = result === 'D' && team.attack > opponent.attack && team.strength > opponent.strength;
  const unluckyHeavyLoss = result === 'L' && goalsAgainst - goalsFor >= 3 && team.strength > opponent.strength;

  if (gotLuckyWin) {
    team.chaos += 0.9; // big boost
  }
  if (wasUnfairDraw) {
    team.chaos -= 0.5; // mild penalty
  } 
  if (unluckyHeavyLoss) {
    team.chaos -= 1.0; // sharp drop
  }

  // Every match, chaos drifts slightly
  if (result === 'W') {
    team.chaos += 0.2;
  } else if (result === 'L') {
    team.chaos -= 0.2;
  }

  // Normalize stats
  team.attack = normalize(team.attack);
  team.defense = normalize(team.defense);
  team.strength = normalize(team.strength);
  team.chaos = normalize(team.chaos);
}

function saveTournament(tournamentId, tournamentName, seasonId, teams) {
  let data = [];

  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE);
    data = JSON.parse(raw);
  }

  let tournament = data.find(t => t.tournamentId === tournamentId);

  if (!tournament) {
    tournament = {
      tournamentId,
      tournamentName,
      seasons: []
    };
    data.push(tournament);
  } else if (!tournament.tournamentName) {
    tournament.tournamentName = tournamentName;
  }

  let season = tournament.seasons.find(s => s.seasonId === seasonId);

  if (!season) {
    season = { seasonId, teams: [] };
    tournament.seasons.push(season);
  }

  season.teams = teams;

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function showTeamStats(team) {
  console.log(`\n📊 ${team.name}`);
  console.log(`ATK: ${team.attack} | DEF: ${team.defense} | STR: ${team.strength} | CHAOS: ${team.chaos}`);
  console.log(`Form: ${team.form.join(' ')}`);
  console.log(`Standings: ${JSON.stringify(team.standings)}`);
}

function updateTeamStanding(team, week, position) {
  team.standings.push({ week, position });
}

module.exports = {
  createTeam,
  saveTournament,
  simulateMatch,
  updateTeamStats,
  updateTeamStanding,
  showTeamStats
};
