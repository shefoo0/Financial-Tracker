// Fake statements (invented merchants, amounts and account numbers).

/** Layout 1: comma, header with separate debit and credit, quoted fields with commas, thousands separators. */
export const CSV_DEBIT_CREDIT = `Date,Description,Debit,Credit,Balance
01/11/2026,"OPENING BALANCE",,,"12,000.00"
03/11/2026,"SALARY CREDIT - ACME TRADING LLC",,"18,000.00","30,000.00"
05/11/2026,"POS-CARREFOUR MALL OF THE EMIRATES, DUBAI","312.45",,"29,687.55"
07/11/2026,"DEWA BILL PAYMENT",1250.00,,"28,437.55"
21/11/2026,"CAREEM RIDE ""AIRPORT""",45.00,,"28,392.55"
`;

/** Layout 2: semicolon, preamble lines, signed single amount, parentheses, "21-Nov-2026" dates, AED in the header. */
export const CSV_SIGNED_SEMICOLON = `Account Statement;;;
Account Number;XXXX-XXXX-4821;;
Statement Period;01-Nov-2026 to 30-Nov-2026;;

Txn Date;Value Date;Transaction Details;Amount (AED);Balance
02-Nov-2026;02-Nov-2026;ENOC PETROL STATION;-180.00;4,820.00
09-Nov-2026;09-Nov-2026;TRANSFER FROM SAVINGS;2,000.00;6,820.00
12-Nov-2026;13-Nov-2026;LULU HYPERMARKET;(236.50);6,583.50
15-Nov-2026;15-Nov-2026;SALIK;-4.00;6,579.50
`;

/** Layout 3: tab separated, no header, amount with Dr/Cr suffix. */
export const CSV_TAB_NO_HEADER = [
  '21/11/2026\tTALABAT DUBAI\t89.90 Dr',
  '22/11/2026\tSALARY NOV\t18,000.00 Cr',
  '23/11/2026\tNETFLIX.COM\t55.00 Dr',
].join('\n');

/** Month-first dates (an export from a foreign bank): 11/21/2026 proves it. */
export const CSV_MONTH_FIRST = `Date,Description,Amount
11/21/2026,COFFEE,-12.00
11/03/2026,REFUND,30.00
`;

/** Type column with Credit/Debit words, BOM and CRLF line ends. */
export const CSV_TYPE_COLUMN = '﻿Posting Date,Narration,Amount,Type\r\n21/11/2026,GYM MEMBERSHIP,300.00,Debit\r\n22/11/2026,REFUND NOON,75.50,Credit\r\n';

/** Unsigned single amount column: direction can't be known. */
export const CSV_UNSIGNED = `Date,Description,Amount
21/11/2026,SHOP A,10.00
22/11/2026,SHOP B,20.00
`;

export const CSV_BAD_ROWS = `Date,Description,Debit,Credit
21/11/2026,GOOD ROW,10.00,
not a date,BAD DATE,5.00,
22/11/2026,BAD AMOUNT,1.234,
23/11/2026,NO AMOUNT,,
Total,,10.00,
`;
