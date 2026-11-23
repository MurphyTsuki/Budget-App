import { Routes } from '@angular/router';

import { AccountsComponent } from './pages/accounts/accounts';
import { AddExpenseComponent } from './pages/add-expense/add-expense';
import { BankComponent } from './pages/bank/bank';
import { BudgetCategoryComponent } from './pages/budget-category/budget-category';
import { BudgetFormComponent } from './pages/budget-form/budget-form';
import { BudgetComponent } from './pages/budget/budget';
import { CashComponent } from './pages/cash/cash';
import { HomeComponent } from './pages/home/home';
import { JournalComponent } from './pages/journal/journal';
import { MotoComponent } from './pages/moto/moto';
import { MvolaComponent } from './pages/mvola/mvola';

/*
 * Adresses :
 *   #/accueil  #/budget  #/budget/2026-12  #/budget/2026-12/definir  #/budget/2026-12/categorie/Essence
 *   #/ajouter  #/depenses  #/comptes  #/comptes/banque  #/comptes/especes  #/comptes/mvola  #/moto
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'accueil' },
  { path: 'accueil', component: HomeComponent },
  { path: 'budget', component: BudgetComponent },
  { path: 'budget/:month', component: BudgetComponent },
  { path: 'budget/:month/definir', component: BudgetFormComponent },
  { path: 'budget/:month/categorie/:category', component: BudgetCategoryComponent },
  { path: 'ajouter', component: AddExpenseComponent },
  { path: 'depenses', component: JournalComponent },
  { path: 'comptes', component: AccountsComponent },
  { path: 'comptes/banque', component: BankComponent },
  { path: 'comptes/especes', component: CashComponent },
  { path: 'comptes/mvola', component: MvolaComponent },
  { path: 'moto', component: MotoComponent },
  // Anciennes adresses
  { path: 'tableau', redirectTo: 'depenses' },
  { path: 'revenus', redirectTo: 'comptes' },
  { path: '**', redirectTo: 'accueil' },
];
