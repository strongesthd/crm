# Sales and finance app

This Twenty app adds workspace objects for products, sales orders and order
lines, internal invoices, cashbook entries, and stock movements. Sales orders
can be linked to the standard Company records. The invoice record page provides
a print view that can be saved as PDF from the browser.

The app uses Twenty's generated record views and forms. Order totals, invoice
totals, paid amounts, stock balances, and cashbook totals are entered and
reconciled manually; creating or changing a record does not post accounting
entries or adjust inventory automatically. Internal invoices are operational
records, not legally valid Vietnamese e-invoices. This app is not a statutory
accounting system.

## Install

From this directory, install the package dependencies and connect the Twenty
CLI to the target workspace. Build the app, then apply it to the active remote:

```bash
yarn install
yarn twenty dev:build
yarn twenty apply
```

Configure the remote with the Twenty CLI before applying. Do not copy workspace
credentials into this repository.
