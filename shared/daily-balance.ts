export type DailyNet = { day: string; net: number };

export function carryBeforeDay(rows: DailyNet[], day: string): number {
  let carry = 0;
  for (const row of rows) {
    if (row.day >= day) break;
    if (!Number.isSafeInteger(row.net)) throw new RangeError("O saldo diário deve estar em centavos inteiros.");
    carry = Math.min(0, carry + row.net);
  }
  return carry;
}

export function dayNetWithCarry(gross: number, expenses: number, carry: number): number {
  if (![gross, expenses, carry].every(Number.isSafeInteger)) {
    throw new RangeError("Faturamento, despesas e residual devem estar em centavos inteiros.");
  }
  return carry + gross - expenses;
}
