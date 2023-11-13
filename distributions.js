// TEMPORARY SOLUTION FOR DISTRIBUTIONS

import { createPublicClient, formatEther, http, parseAbiItem } from "viem";
import { mainnet } from "viem/chains";

/** @type {Map<string, BigInt>} Mapping of addresses to their amount to be reimbursed. */
const reimburseMap = new Map();
const fromBlock = 17355003n; // Closest block to Sun May 28 12:00:00 AM EDT 2023

const client = createPublicClient({
  transport: http(),
  chain: mainnet,
});

const JBETHPaymentTerminal3_1_2 = "0x1d9619E10086FdC1065B114298384aAe3F680CC0";
const JBETHPaymentTerminal3_1_1 = "0x457cD63bee88ac01f3cD4a67D5DCc921D8C0D573";
const JBETHPaymentTerminal3_1 = "0xFA391De95Fcbcd3157268B91d8c7af083E607A5C";
const DistributePayoutsEvent = parseAbiItem(
  "event DistributePayouts(uint256 indexed fundingCycleConfiguration, uint256 indexed fundingCycleNumber, uint256 indexed projectId, address beneficiary, uint256 amount, uint256 distributedAmount, uint256 fee, uint256 beneficiaryDistributionAmount, bytes metadata, address caller)"
);

/** @type {Array} logs */
const payoutLogs = await client.getLogs({
  address: [
    JBETHPaymentTerminal3_1,
    JBETHPaymentTerminal3_1_1,
    JBETHPaymentTerminal3_1_2,
  ],
  event: DistributePayoutsEvent,
  args: {
    projectId: 1n,
  },
  fromBlock,
});

const JBController = "0x7Cb86D43B665196BC719b6974D320bf674AFb395";
const JBController3_0_1 = "0x696f8175E114C5C89248Fb254185Df3Df4cD03f3";
const JBController3_1 = "0x1d260DE91233e650F136Bf35f8A4ea1F2b68aDB6";
const DistributeReservedTokensEvent = parseAbiItem(
  "event DistributeReservedTokens(uint256 indexed fundingCycleConfiguration, uint256 indexed fundingCycleNumber, uint256 indexed projectId, address beneficiary, uint256 tokenCount, uint256 beneficiaryTokenCount, string memo, address caller)"
);

const reservedLogs = await client.getLogs({
  address: [JBController, JBController3_0_1, JBController3_1],
  event: DistributeReservedTokensEvent,
  args: {
    projectId: 1n,
  },
  fromBlock,
});

await Promise.all(
  [...payoutLogs, ...reservedLogs].map(async (e) => {
    const tx = await client.getTransaction({
      hash: e.transactionHash,
    });
    const txGas = tx.gas * tx.gasPrice;
    reimburseMap.set(tx.from, (reimburseMap.get(tx.from) ?? 0n) + txGas);
    // console.log(e.transactionHash, txGas, tx.from);
  })
);

const formattedResults = Array.from(reimburseMap.entries()).map(
  ([address, total]) => ({
    address,
    total: formatEther(total),
  })
);
console.table(formattedResults);

/*Array.from(reimburseMap.entries()).forEach(([address, total]) =>
  console.log(`${address}: ${formatEther(total)}`)
);*/
