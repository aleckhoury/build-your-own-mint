const plaid = require("plaid");

module.exports = new plaid.Client({
  clientID: process.env.PLAID_CLIENT_ID,
  secret: process.env.PLAID_SECRET,
  env: plaid.environments.development,
  options: { version: "2020-09-14" },
});
