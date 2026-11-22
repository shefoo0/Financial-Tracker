/** Bank account statement, columns collapsed by spaces, with a running balance. Oldest first. */
export const BANK_STATEMENT = `
EXAMPLE BANK PJSC
Account Statement
Account Number: 0123 4567 8901 2345
IBAN: AE07 0331 2345 6789 0123 456
Statement Period: 01/11/2026 to 30/11/2026
Currency: AED

Date Description Debit Credit Balance
Opening Balance 5,000.00
03/11/2026 SALARY CREDIT ACME TRADING LLC 18,000.00 23,000.00
05/11/2026 POS CARREFOUR MOE DUBAI AE 312.45 22,687.55
07/11/2026 DEWA BILL PAYMENT 1,250.00 21,437.55
12/11/2026 ATM CASH WITHDRAWAL 500.00 20,937.55
Page 1 of 2
Closing Balance 20,937.55
Customer Care 600 000000
`;

/** Same layout, newest first, with a Dr/Cr marker on the balance. */
export const BANK_STATEMENT_DESC = `
Statement of account
01 Nov 2026 - 30 Nov 2026
Date Narration Amount Balance
28 Nov 2026 UBER TRIP HELP.UBER.COM 62.00 2,038.00 Cr
20 Nov 2026 SALARY NOV 2,000.00 2,100.00 Cr
10 Nov 2026 NOON ONLINE SHOPPING 150.00 100.00 Cr
`;

/** Credit card statement: purchases are positive, "CR" = payment or refund; two dates per line. */
export const CARD_STATEMENT = `
EXAMPLE BANK Credit Card Statement
Card Number: 4111 11XX XXXX 5678
Statement Date 15 Dec 2026
Statement Period 16 Nov 2026 to 15 Dec 2026
Minimum payment due 150.00

Trans Date Post Date Description Amount (AED)
16 Nov 17 Nov TALABAT DUBAI AE 89.90
28 Nov 29 Nov NETFLIX.COM LOS GATOS 55.00
30 Nov 01 Dec REFUND NOON.COM 120.00 CR
02 Dec 03 Dec PAYMENT RECEIVED - THANK YOU 2,000.00 CR
29 Dec 29 Dec NOT IN PERIOD 10.00
05 Jan 06 Jan SALIK TOLL 4.00
`;

/** Year rollover: dates without a year and a period across New Year. */
export const ROLLOVER_STATEMENT = `
Statement Period: 15/12/2026 - 14/01/2027
Account No: XXXX 9876
28/12 GROCERY LULU 150.00 CR
03/01 SPINNEYS 99.00
29/02 LEAP DAY 1.00
`;

/** Leap day: 2028 is a leap year, 2027 is not. */
export const LEAP_STATEMENT = `
Statement Period: 15/02/2028 to 14/03/2028
29/02 LEAP DAY SHOP 20.00
`;

export const NON_LEAP_STATEMENT = `
Statement Period: 15/02/2027 to 14/03/2027
29/02 IMPOSSIBLE 20.00
28/02 REAL DAY 21.00
`;

/** OCR-ish: noise, leading bullets, O for 0, wrapped description, no marker, 3-column debit/credit/balance. */
export const OCR_STATEMENT = `
~~ EXAMPLE BANK ~~
|||  ..,,
Date   Description   Debit   Credit   Balance
Opening Balance   1,000.00
. 02/11/2026   TALABAT   DUBAI   50.OO   0.00   950.00
| 04/11/2026 ENOC STATION 7 SHEIKH
ZAYED ROAD 200.00 750.00
-- 06/11/2026  SALARY  ACME   0.00   5,000.00   5,750.00
08/11/2026 SOMETHING UNREADABLE
oooo ---- ///
10/11/2026 CAFE NERO 1,5OO.OO 4,250.00
Page 2 of 3
www.examplebank.ae
`;

/** A line that has a debit/credit pair and no balance chain (direction can't be proven). */
export const AMBIGUOUS_STATEMENT = `
Statement Period: 01/11/2026 to 30/11/2026
05/11/2026 MYSTERY MERCHANT 99.00
`;

export const NO_YEAR_NO_PERIOD = `
05/11 SHOP ONE 10.00
`;
