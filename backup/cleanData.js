const fs = require("fs");
const path = require("path");

// Path to your JSON file
const filePath = path.join(__dirname, "data.json");

// Read and parse the JSON
let rawData = fs.readFileSync(filePath, "utf-8");
let matches = JSON.parse(rawData);

// Loop and clean
matches = matches.map(match => {
  const outcome = match.teamA.outcome || match.teamB.outcome || "";
  const correctScore = match.teamA.correct_score || match.teamB.correct_score || "";

  // Delete from both teamA and teamB
  delete match.teamA.outcome;
  delete match.teamA.correct_score;
  delete match.teamB.outcome;
  delete match.teamB.correct_score;

  // Add to root of match object
  match.outcome = outcome;
  match.correct_score = correctScore;

  return match;
});

// Write back to file
fs.writeFileSync(filePath, JSON.stringify(matches, null, 2), "utf-8");

console.log("✅ Data cleaned successfully.");
