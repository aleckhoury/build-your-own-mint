const dotenv = require("dotenv");
dotenv.config();

const account = process.argv[2];
if (!account) {
  throw new Error("An account name must be provided.");
}

const fs = require("fs");
const util = require("util");
const path = require("path");
const moment = require("moment");
const express = require("express");
const bodyParser = require("body-parser");
const plaidClient = require("../lib/plaidClient");
const saveEnv = require("./saveEnv");

const app = express();
app.use(express.static(path.resolve(__dirname)));
app.set("view engine", "ejs");
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
app.use(bodyParser.json());

app.get("/", (req, res, next) => {
  res.render(path.resolve(__dirname, "plaid.ejs"), {
    PLAID_ACCOUNT: account,
    PLAID_PUBLIC_KEY: process.env.PLAID_PUBLIC_KEY,
  });
});

const APP_PORT = 8080;
let PUBLIC_TOKEN = null;
let ITEM_ID = null;

function saveAccessToken(token) {
  console.log();
  console.log(`Saving access token for account "${account}": ${token}`);
  saveEnv({
    [`PLAID_TOKEN_${account}`]: token,
  });
  console.log("Saved.");
  console.log();
}

app.post("/create_link_token", async (request, response, next) => {
  // 1. Grab the client_user_id by searching for the current user in your database
  const clientUserId = process.env.ALEC_USER_ID;
  // 2. Create a link_token for the given user
  const linkTokenResponse = await plaidClient.createLinkToken({
    user: {
      client_user_id: clientUserId,
    },
    client_name: "Alec's Personal Finances",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
  });
  const link_token = linkTokenResponse.link_token;
  // 3. Send the data to the client
  response.json({ link_token });
});

app.post("/fetch_and_delete", async function (request, response, next) {
  console.log("made it here");
  plaidClient
    .getItem({
      clientId: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
    })
    .then((res) => {
      console.log(res);
    })
    .catch((err) => {
      // handle error
      console.log(err);
    });
});

// Exchange token flow - exchange a Link public_token for
// an API access_token
// https://plaid.com/docs/#exchange-token-flow
app.post("/get_access_token", function (request, response, next) {
  PUBLIC_TOKEN = request.body.public_token;
  plaidClient.exchangePublicToken(
    PUBLIC_TOKEN,
    function (error, tokenResponse) {
      console.log(error);
      if (error != null) {
        prettyPrintResponse(error);
        return response.json({
          error: error,
        });
      }
      console.log(tokenResponse);
      ACCESS_TOKEN = tokenResponse.access_token;
      saveAccessToken(ACCESS_TOKEN);
      ITEM_ID = tokenResponse.item_id;
      prettyPrintResponse(tokenResponse);
      response.json({
        access_token: ACCESS_TOKEN,
        item_id: ITEM_ID,
        error: null,
      });
    }
  );
});

// Retrieve Transactions for an Item
// https://plaid.com/docs/#transactions
app.get("/transactions", function (request, response, next) {
  // Pull transactions for the Item for the last 30 days
  var startDate = moment().subtract(30, "days").format("YYYY-MM-DD");
  var endDate = moment().format("YYYY-MM-DD");
  plaidClient.getTransactions(
    ACCESS_TOKEN,
    startDate,
    endDate,
    {
      count: 250,
      offset: 0,
    },
    function (error, transactionsResponse) {
      if (error != null) {
        prettyPrintResponse(error);
        return response.json({
          error: error,
        });
      } else {
        prettyPrintResponse(transactionsResponse);
        response.json({ error: null, transactions: transactionsResponse });
      }
    }
  );
});

// Retrieve Identity for an Item
// https://plaid.com/docs/#identity
app.get("/identity", function (request, response, next) {
  plaidClient.getIdentity(ACCESS_TOKEN, function (error, identityResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(identityResponse);
    response.json({ error: null, identity: identityResponse });
  });
});

// Retrieve real-time Balances for each of an Item's accounts
// https://plaid.com/docs/#balance
app.get("/balance", function (request, response, next) {
  plaidClient.getBalance(ACCESS_TOKEN, function (error, balanceResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(balanceResponse);
    response.json({ error: null, balance: balanceResponse });
  });
});

// Retrieve an Item's accounts
// https://plaid.com/docs/#accounts
app.get("/accounts", function (request, response, next) {
  plaidClient.getAccounts(ACCESS_TOKEN, function (error, accountsResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(accountsResponse);
    response.json({ error: null, accounts: accountsResponse });
  });
});

// Retrieve ACH or ETF Auth data for an Item's accounts
// https://plaid.com/docs/#auth
app.get("/auth", function (request, response, next) {
  plaidClient.getAuth(ACCESS_TOKEN, function (error, authResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(authResponse);
    response.json({ error: null, auth: authResponse });
  });
});

// Create and then retrieve an Asset Report for one or more Items. Note that an
// Asset Report can contain up to 100 items, but for simplicity we're only
// including one Item here.
// https://plaid.com/docs/#assets
app.get("/assets", function (request, response, next) {
  // You can specify up to two years of transaction history for an Asset
  // Report.
  var daysRequested = 10;

  // The `options` object allows you to specify a webhook for Asset Report
  // generation, as well as information that you want included in the Asset
  // Report. All fields are optional.
  var options = {
    client_report_id: "Custom Report ID #123",
    // webhook: 'https://your-domain.tld/plaid-webhook',
    user: {
      client_user_id: "Custom User ID #456",
      first_name: "Alice",
      middle_name: "Bobcat",
      last_name: "Cranberry",
      ssn: "123-45-6789",
      phone_number: "555-123-4567",
      email: "alice@example.com",
    },
  };
  plaidClient.createAssetReport(
    [ACCESS_TOKEN],
    daysRequested,
    options,
    function (error, assetReportCreateResponse) {
      if (error != null) {
        prettyPrintResponse(error);
        return response.json({
          error: error,
        });
      }
      prettyPrintResponse(assetReportCreateResponse);

      var assetReportToken = assetReportCreateResponse.asset_report_token;
      respondWithAssetReport(20, assetReportToken, client, response);
    }
  );
});

// Retrieve information about an Item
// https://plaid.com/docs/#retrieve-item
app.get("/item", function (request, response, next) {
  // Pull the Item - this includes information about available products,
  // billed products, webhook information, and more.
  plaidClient.getItem(ACCESS_TOKEN, function (error, itemResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    // Also pull information about the institution
    plaidClient.getInstitutionById(
      itemResponse.item.institution_id,
      function (err, instRes) {
        if (err != null) {
          var msg =
            "Unable to pull institution information from the Plaid API.";
          console.log(msg + "\n" + JSON.stringify(error));
          return response.json({
            error: msg,
          });
        } else {
          prettyPrintResponse(itemResponse);
          response.json({
            item: itemResponse.item,
            institution: instRes.institution,
          });
        }
      }
    );
  });
});

var server = app.listen(APP_PORT, function () {
  console.log(`Server started at http://localhost:${APP_PORT}`);
});

var prettyPrintResponse = (response) => {
  console.log(util.inspect(response, { colors: true, depth: 4 }));
};

// This is a helper function to poll for the completion of an Asset Report and
// then send it in the response to the plaidClient. Alternatively, you can provide a
// webhook in the `options` object in your `/asset_report/create` request to be
// notified when the Asset Report is finished being generated.
var respondWithAssetReport = (
  numRetriesRemaining,
  assetReportToken,
  client,
  response
) => {
  if (numRetriesRemaining == 0) {
    return response.json({
      error: "Timed out when polling for Asset Report",
    });
  }

  plaidClient.getAssetReport(
    assetReportToken,
    function (error, assetReportGetResponse) {
      if (error != null) {
        prettyPrintResponse(error);
        if (error.error_code == "PRODUCT_NOT_READY") {
          setTimeout(
            () =>
              respondWithAssetReport(
                --numRetriesRemaining,
                assetReportToken,
                client,
                response
              ),
            1000
          );
          return;
        }

        return response.json({
          error: error,
        });
      }

      plaidClient.getAssetReportPdf(
        assetReportToken,
        function (error, assetReportGetPdfResponse) {
          if (error != null) {
            return response.json({
              error: error,
            });
          }

          response.json({
            error: null,
            json: assetReportGetResponse.report,
            pdf: assetReportGetPdfResponse.buffer.toString("base64"),
          });
        }
      );
    }
  );
};

app.post("/set_access_token", function (request, response, next) {
  ACCESS_TOKEN = request.body.access_token;
  plaidClient.getItem(ACCESS_TOKEN, function (error, itemResponse) {
    response.json({
      item_id: itemResponse.item.item_id,
      error: false,
    });
  });
});
