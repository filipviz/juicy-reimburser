# juicy-reimburser

`juicy-reimburser` compiles gas fees from your [Gnosis Safe](https://safe.global/), your [Juicebox](https://juicebox.money) project, and any manual additions (within the date range you specify).

Then it builds reimbursement files that can be used with [Safe Transaction Builder](https://help.safe.global/en/articles/4680071-transaction-builder), [disperse.app](https://disperse.app/), or other tools.

## How to Run

In your terminal, run:

```bash
npx juicy-reimburser
```

You must have [node.js](https://nodejs.org/) (v18.0+) installed for this to work.

## Which Transactions Are Included?

- Gas fees paid to execute Gnosis Safe transactions.
- Gas fees paid to send payouts or reserved tokens from your Juicebox project.
- Any other fees you add.
