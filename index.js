#!/usr/bin/env node

import { writeFile } from "fs/promises";
import {
  createPublicClient,
  http,
  isAddress,
  isAddressEqual,
  formatEther,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import chalk from "chalk";
import inquirer from "inquirer";
import DatePrompt from "inquirer-date-prompt";
import Spinnies from "spinnies";
inquirer.registerPrompt("date", DatePrompt);

const spin = new Spinnies();

// JSON.stringify fix for BigInt
BigInt.prototype.toJSON = function () {
  return this.toString();
};

// Initialize Viem client
const client = createPublicClient({
  chain: mainnet,
  transport: http(),
});

console.log(
  chalk.bold.underline("\nWelcome to JUICY-REIMBURSER"),
  chalk.italic.magenta("Reimbursing since JBP-354\n")
);

const answers = await inquirer.prompt([
  {
    name: "transaction_types",
    type: "checkbox",
    message: "Include transactions from my...",
    choices: ["Safe", "Juicebox", "Other (manual entry)"],
  },
  {
    name: "safe_address",
    type: "input",
    message: "Your Safe's address?",
    default: "dao.jbx.eth",
    when(answers) {
      return answers.transaction_types.includes("Safe");
    },
  },
  {
    name: "project_id",
    type: "input",
    message: "Your Juicebox project's ID?",
    default: "1",
    when(answers) {
      return answers.transaction_types.includes("Juicebox");
    },
  },
  {
    name: "date_range",
    type: "checkbox",
    message: "Filter transactions by a...",
    choices: ["Start date", "End date"],
  },
  {
    name: "start_date",
    type: "date",
    message: "Start date?",
    when(answers) {
      return answers.date_range.includes("Start date");
    },
  },
  {
    name: "end_date",
    type: "date",
    message: "End date?",
    when(answers) {
      return answers.date_range.includes("End date");
    },
  },
]);

let refunds = {},
  promises = [];

if (answers.transaction_types.includes("Other (manual entry)"))
  await handleManual();
if (answers.transaction_types.includes("Safe")) promises.push(handleSafe());
if (answers.transaction_types.includes("Juicebox"))
  promises.push(handleJuicebox());

await Promise.all(promises);

// Write transaction builder output to builder.json
spin.add("main", {
  text: "Writing transaction builder output...",
});

await writeFile(
  "./builder.json",
  JSON.stringify({
    chainId: "1",
    createdAt: new Date().getTime(),
    meta: {
      name: `CHERGS Transaction Bundle`,
      description: `Includes transactions from ${answers.transaction_types.join(
        " & "
      )}${
        answers.start_date
          ? `, starting at ${answers.start_date.toLocaleString()}`
          : ""
      }${
        answers.end_date
          ? `, ending at ${answers.end_date.toLocaleString()}`
          : ""
      }`,
    },
    transactions: Object.entries(refunds).map(([to, v]) => ({
      to,
      value: v.toString(),
    })),
  })
).catch((e) => {
  spin.fail("main", {
    text: `Failed to write output. See full error message below.`,
  });
  console.error(e);
  process.exit(1);
});

spin.succeed("main", {
  text: `Wrote transaction builder output to ${chalk.blue.underline(
    "builder.json"
  )}`,
});

// Build and write csv output to refunds.csv
spin.add("main", { text: "Writing csv output..." });
await writeFile(
  "./refunds.csv",
  Object.entries(refunds)
    .map(([to, amount]) => `${to}, ${formatEther(amount)}`)
    .join("\n")
).catch((e) => {
  spin.fail("mail", {
    text: `Failed to write output. See full error message below.`,
  });
  console.error(e);
  process.exit(1);
});
spin.succeed("main", {
  text: `Wrote csv output to ${chalk.blue.underline("refunds.csv")}`,
});

async function handleManual() {
  console.log(chalk.underline("\nBeginning Manual Entry"));
  let manual_entries;
  do {
    manual_entries = await inquirer.prompt([
      {
        name: "to",
        type: "input",
        message: "Recipient?",
        default: "dao.jbx.eth",
      },
      {
        name: "value",
        type: "number",
        message: "ETH Amount?",
        default: 0,
      },
      {
        name: "next",
        type: "confirm",
        message: "Continue?",
      },
    ]);

    // Validate address, resolve ENS if necessary
    spin.add("manual", { text: "Validating address..." });
    if (!isAddress(manual_entries.to)) {
      if (manual_entries.to.slice(-4) !== ".eth") {
        spin.fail("manual", { text: "Invalid ENS/address. Try again." });
        manual_entries.next = true;
        continue;
      }

      manual_entries.to = await client.getEnsAddress({
        name: normalize(manual_entries.to),
      });

      if (
        isAddressEqual(
          manual_entries.to,
          "0x0000000000000000000000000000000000000000"
        )
      ) {
        spin.fail("manual", { text: "Could not resolve ENS. Try again." });
        manual_entries.next = true;
        continue;
      }
    }
    spin.succeed("manual", {
      text: `Address resolved to ${manual_entries.to}`,
    });

    if (refunds[manual_entries.to.toLowerCase()])
      refunds[manual_entries.to.toLowerCase()] += BigInt(
        manual_entries.value * 1e18
      );
    else
      refunds[manual_entries.to.toLowerCase()] = BigInt(
        manual_entries.value * 1e18
      );
  } while (manual_entries.next);

  console.log(
    chalk.green(
      `✓ Included ${Object.entries(refunds).length} manual entry payouts.`
    )
  );

  return Promise.resolve();
}

async function handleSafe() {
  const safe_endpoint = "https://safe-transaction-mainnet.safe.global/api";

  // Validate Safe address, resolve ENS if necessary
  spin.add("safe", { text: "Validating Safe address..." });
  if (!isAddress(answers.safe_address)) {
    if (answers.safe_address.slice(-4) !== ".eth") {
      spin.fail("safe", { text: "Invalid Safe ENS/address." });
      process.exit(1);
    }

    answers.safe_address = await client.getEnsAddress({
      name: normalize(answers.safe_address),
    });

    if (
      isAddressEqual(
        answers.safe_address,
        "0x0000000000000000000000000000000000000000"
      )
    ) {
      spin.fail("safe", { text: "Could not resolve Safe ENS." });
      process.exit(1);
    }
  }
  spin.succeed("safe", {
    text: `Safe address resolved to ${answers.safe_address}`,
  });

  // Fetch Safe transactions
  spin.add("safe", { text: "Fetching Safe transactions..." });

  let safe_transactions = [];
  let next =
    `${safe_endpoint}/v1/safes/${answers.safe_address}/all-transactions/?` +
    new URLSearchParams({
      executed: "true",
      queued: "false",
    });

  while (next)
    await fetch(next)
      .then((res) => res.json())
      .then((json) => {
        next = json.next;
        safe_transactions = safe_transactions.concat(json.results);
      })
      .catch((e) => {
        spin.fail("safe", {
          text: "Failed to fetch Safe transactions. Full error message:",
        });
        console.error(e);
        process.exit(1);
      });

  spin.succeed("safe", {
    text: `Fetched ${safe_transactions.length} Safe transactions`,
  });

  // Filter Safe transactions and calculate totals
  spin.add("safe", { text: "Processing Safe executions..." });

  safe_transactions = safe_transactions.filter(
    (e, i) =>
      i ===
        safe_transactions.findIndex(
          (t) => t.transactionHash === e.transactionHash
        ) &&
      e.executor &&
      (answers.start_date
        ? new Date(e.executionDate) > answers.start_date
        : true) &&
      (answers.end_date ? new Date(e.executionDate) < answers.end_date : true)
  );

  // Sum fees from each address
  safe_transactions.forEach((e) => {
    if (refunds[e.executor.toLowerCase()])
      refunds[e.executor.toLowerCase()] += BigInt(e.fee);
    else refunds[e.executor.toLowerCase()] = BigInt(e.fee);
  });

  spin.succeed("safe", {
    text: `Included ${safe_transactions.length} Safe executions`,
  });

  return Promise.resolve();
}

async function handleJuicebox() {
  let juiceboxPromises = [];
  const juicebox_subgraph =
    "https://api.studio.thegraph.com/query/30654/mainnet-dev/6.2.0";

  // TODO: Paginate these
  for await (const queryType of [
    "distributePayoutsEvents",
    "distributeReservedTokensEvents",
  ]) {
    spin.add(queryType, {
      text: `Fetching ${queryType} Juicebox transaction hashes`,
    });
    await fetch(juicebox_subgraph, {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({
        query: `{
          ${queryType}(
            first: 1000
            skip: 0
            where: {projectId: ${answers.project_id}${
          answers.start_date
            ? `, timestamp_gt: ${Math.floor(answers.start_date / 1000)}`
            : ""
        }${
          answers.end_date
            ? `, timestamp_lt: ${Math.floor(answers.end_date / 1000)}`
            : ""
        }}
            orderBy: timestamp
            orderDirection: asc
          ) {
            txHash
            caller
          }
        }`,
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        spin.succeed(queryType, {
          text: `Fetched ${json.data[queryType].length} ${queryType}`,
        });
        spin.add(queryType, {
          text: `Fetching and processing ${json.data[queryType].length} ${queryType} transactions`,
        });

        json.data[queryType].forEach((v) => {
          juiceboxPromises.push(
            client
              .getTransaction({
                hash: v.txHash,
              })
              .then((tx) => {
                if (refunds[tx.from.toLowerCase()])
                  refunds[tx.from.toLowerCase()] +=
                    BigInt(tx.gas) * BigInt(tx.gasPrice);
                else
                  refunds[tx.from.toLowerCase()] =
                    BigInt(tx.gas) * BigInt(tx.gasPrice);
              })
          );
        });

        spin.succeed(queryType, {
          text: `Included ${json.data[queryType].length} ${queryType} transactions`,
        });
      })
      .catch((e) => {
        spin.fail(queryType, {
          text: "Failed while fetching and processing Juicebox transactions. See full error below:",
        });
        console.error(e);
        process.exit(1);
      });
  }

  await Promise.all(juiceboxPromises);
  return Promise.resolve();
}
