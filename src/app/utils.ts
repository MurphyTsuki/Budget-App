/* Fonctions utilitaires : dates, montants, identifiants. */

export const MONTHS: readonly string[] = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/* ---------- Dates ---------- */

/** Premier jour suivi par l'application : rien n'est saisi avant. */
export const FIRST_DAY = '2026-11-01';
export const FIRST_MONTH = FIRST_DAY.slice(0, 7);

/** Message commun aux formulaires quand la date est refusée */
export const DATE_ERROR = 'Date invalide (JJ/MM/AAAA, à partir du 01/11/2026).';

/** Date du jour au format ISO local (AAAA-MM-JJ), sans décalage de fuseau horaire. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isISODate(value: unknown): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

/** Convertit "JJ/MM/AAAA" en "AAAA-MM-JJ". Renvoie null si le format est invalide. */
export function frToISO(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

/** Comme frToISO, mais vérifie aussi que la date existe (pas de 31/02/2026) et n'est pas avant FIRST_DAY. */
export function parseFrDate(text: string): string | null {
  const iso = frToISO(text);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d || iso < FIRST_DAY) {
    return null;
  }
  return iso;
}

/** Date ISO décalée de n jours (todayISO décalé de -1 = hier). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Mois d'une date ISO (AAAA-MM). */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Mois décalé de n mois ("2026-11", -1 -> "2026-10"). */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + n, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** "2026-11" -> "Novembre 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Nombre de jours restants dans le mois de la date ISO (le jour même compris). */
export function daysLeftInMonth(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m, 0).getDate() - d + 1;
}

const WEEKDAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const SHORT_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** "2026-11-21" -> "Sam. 21 nov." (avec « Aujourd'hui » et « Hier ») */
export function dayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Aujourd'hui";
  if (iso === addDaysISO(today, -1)) return 'Hier';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const label = `${WEEKDAYS[date.getDay()]} ${d} ${SHORT_MONTHS[m - 1]}`;
  return y === new Date().getFullYear() ? label : `${label} ${y}`;
}

/** AAAA-MM-JJ -> JJ/MM/AAAA */
export function isoToFr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* ---------- Montants ---------- */

/** Arrondi à 2 décimales (évite les résultats du type 0,30000000000000004). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Montants affichés avec au plus 2 décimales (1 500,5 / 1 500,25). */
export function formatMoney(n: number): string {
  // Espace insécable classique : l'espace fine (U+202F) n'existe pas dans les polices Outfit et JetBrains Mono
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ /g, ' ');
}

/** Nombre -> texte pour un champ de saisie (1500.5 -> "1500,5"). */
export function amountToInput(n: number): string {
  return String(n).replace('.', ',');
}

/**
 * Ne garde que les chiffres et UNE virgule (2 décimales maximum).
 * Le point est converti en virgule. Le signe « - » n'est permis que si allowNegative.
 */
export function cleanAmountText(text: string, allowNegative: boolean): string {
  let out = text.replace(/\./g, ',').replace(/[^\d,-]/g, '');
  const negative = allowNegative && out.startsWith('-');
  out = out.replace(/-/g, '');

  const comma = out.indexOf(',');
  if (comma !== -1) {
    const integerPart = out.slice(0, comma);
    const decimals = out.slice(comma + 1).replace(/,/g, '').slice(0, 2);
    out = (integerPart === '' ? '0' : integerPart) + ',' + decimals;
  }
  return (negative ? '-' : '') + out;
}

/** Texte saisi -> nombre ("1500,5" -> 1500.5 ; "1500," -> 1500). null si invalide. */
export function parseNumber(value: string, allowNegative = false): number | null {
  let text = value.trim().replace(',', '.');
  if (text.endsWith('.')) text += '0'; // aucun chiffre après la virgule = 0
  const pattern = allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(text)) return null;
  return round2(Number(text));
}

/** Montant strictement positif, ou null. */
export function parseAmount(value: string): number | null {
  const amount = parseNumber(value);
  return amount !== null && amount > 0 ? amount : null;
}

/* ---------- Listes ---------- */

export function generateId(list: readonly { id: number }[]): number {
  let id = Date.now();
  while (list.some((item) => item.id === id)) id++;
  return id;
}
