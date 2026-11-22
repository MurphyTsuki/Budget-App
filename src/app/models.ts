/** Les trois comptes : la banque (BRED), les espèces et le mobile money MVola. */
export type AccountKey = 'banque' | 'cash' | 'mvola';

/** Comptes dont on peut fixer le solde à une date (relevé, appli de la banque ou de MVola). */
export type ReferenceKey = 'banque' | 'mvola';

/**
 * Type d'opération :
 * - depense : argent dépensé depuis un compte, toujours rangé dans une des 12 catégories ;
 * - revenu : argent qui entre sur un compte (salaire, espèces reçues...) ;
 * - retrait-banque / depot-mvola / retrait-mvola : argent qui passe d'un compte à l'autre (hors budget).
 */
export type OperationKind = 'depense' | 'revenu' | 'retrait-banque' | 'depot-mvola' | 'retrait-mvola';

/** Comment une dépense a été payée (pour l'affichage dans le journal). */
export type Channel = 'especes' | 'achat-en-ligne' | 'virement' | 'transfert' | 'frais';

export interface Operation {
  id: number;
  /** Date au format ISO (AAAA-MM-JJ) */
  date: string;
  kind: OperationKind;
  /** Compte d'où part l'argent (ou où il arrive pour un revenu) */
  account: AccountKey;
  amount: number;
  description: string;
  /** Catégorie de budget (dépenses uniquement) */
  category: string | null;
  channel: Channel | null;
  /** Frais MVola : identifiant du retrait ou du transfert qui les a causés */
  parentId: number | null;
}

/** Solde connu d'un compte à une date donnée. */
export interface Reference {
  /** Date au format ISO (AAAA-MM-JJ) */
  date: string;
  amount: number;
}

/** Budget d'un mois : un montant par catégorie et le nombre de modifications déjà faites. */
export interface MonthBudget {
  amounts: Record<string, number>;
  edits: number;
}

/** Nombre de modifications permises après la validation d'un budget. */
export const MAX_BUDGET_EDITS = 3;

/** Opérations qui font passer l'argent d'un compte à un autre : [départ, arrivée]. */
export const MOVES: Record<'retrait-banque' | 'depot-mvola' | 'retrait-mvola', [AccountKey, AccountKey]> = {
  'retrait-banque': ['banque', 'cash'],
  'depot-mvola': ['cash', 'mvola'],
  'retrait-mvola': ['mvola', 'cash'],
};

export const ACCOUNTS: Record<AccountKey, { name: string; color: string; icon: string; path: string }> = {
  banque: { name: 'Banque', color: '#00c1f2', icon: 'gem', path: 'banque' },
  cash: { name: 'Espèces', color: '#e2432c', icon: 'coin', path: 'especes' },
  mvola: { name: 'MVola', color: '#ffd200', icon: 'phone', path: 'mvola' },
};

export interface Category {
  name: string;
  icon: string;
  color: string;
}

/** Les 12 catégories du budget mensuel. */
export const CATEGORIES: readonly Category[] = [
  { name: 'Couple', icon: 'heart', color: '#f08fa8' },
  { name: 'Bien-être', icon: 'leaf', color: '#9fd9c0' },
  { name: 'Box', icon: 'wifi', color: '#7fb8f0' },
  { name: 'Jirama', icon: 'drop', color: '#f5cf62' },
  { name: 'Dépenses journalières', icon: 'basket', color: '#f2b880' },
  { name: 'Dépenses maison', icon: 'house', color: '#c9a8f5' },
  { name: 'Tennis', icon: 'tennis', color: '#c8e07a' },
  { name: 'Crédit Telma', icon: 'phone', color: '#e9a7ef' },
  { name: 'Imprévu', icon: 'alert', color: '#ef7466' },
  { name: 'Réparation moto', icon: 'wrench', color: '#a8b4c4' },
  { name: 'Essence', icon: 'fuel', color: '#d9b98c' },
  { name: 'Dépense Antsirabe', icon: 'pin', color: '#8fd0e8' },
];

/** Les frais MVola vont automatiquement dans cette catégorie. */
export const FEES_CATEGORY = 'Crédit Telma';

/** Les virements bancaires vont automatiquement dans cette catégorie. */
export const TRANSFER_CATEGORY = 'Imprévu';

export function findCategory(name: string | null): Category {
  return CATEGORIES.find((c) => c.name === name) ?? { name: name ?? '', icon: 'tag', color: '#a3978a' };
}

export function isCategory(name: unknown): name is string {
  return CATEGORIES.some((c) => c.name === name);
}
