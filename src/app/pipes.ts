import { Pipe, PipeTransform } from '@angular/core';

import { formatMoney, isoToFr } from './utils';

/** 1500.5 -> "1 500,5" */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number): string {
    return formatMoney(value);
  }
}

/** "2026-10-13" -> "13/10/2026" */
@Pipe({ name: 'frDate' })
export class FrDatePipe implements PipeTransform {
  transform(value: string): string {
    return isoToFr(value);
  }
}
