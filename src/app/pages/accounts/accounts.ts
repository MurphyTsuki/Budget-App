import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { MoneyPipe } from '../../pipes';

/** Page « Comptes » : la banque, les espèces et MVola (chaque carte mène au compte). */
@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.html',
  imports: [RouterLink, IconComponent, MoneyPipe],
})
export class AccountsComponent {
  protected readonly store = inject(BudgetStore);
}
