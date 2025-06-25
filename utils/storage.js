const fs = require('fs');
const path = require('path');

function sanitizeTournamentId(tournamentId) {
  const parts = tournamentId.split(':');
  return parts[parts.length - 1];
}

function getMatchesFile(tournamentId) {
  const cleanId = sanitizeTournamentId(tournamentId);
  return path.join(__dirname, `../matches-${cleanId}.json`);
}

function getStandingsFile(tournamentId) {
  const cleanId = sanitizeTournamentId(tournamentId);
  return path.join(__dirname, `../standings-${cleanId}.json`);
}

function loadMatches(tournamentId) {
  const MATCHES_FILE = getMatchesFile(tournamentId);
  if (fs.existsSync(MATCHES_FILE)) {
    const raw = fs.readFileSync(MATCHES_FILE, 'utf8');
    return JSON.parse(raw);
  }
  return [];
}

function saveMatches(tournamentId, matches) {
  const MATCHES_FILE = getMatchesFile(tournamentId);
  fs.writeFileSync(MATCHES_FILE, JSON.stringify(matches, null, 2));
}

function saveStandings(tournamentId, standings) {
  const STANDINGS_FILE = getStandingsFile(tournamentId);
  fs.writeFileSync(STANDINGS_FILE, JSON.stringify(standings, null, 2));
}

module.exports = {
  loadMatches,
  saveMatches,
  saveStandings,
};
