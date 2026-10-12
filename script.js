/* ============================================================
   Mon Budget Simple
   ============================================================ */

const $ = id => document.getElementById(id);

const KEYS = {
    expenses: 'expenses',
    incomes: 'incomes',
    mode: 'paymentMode',
    bank: 'bankReference'
};

const METHOD_LABELS = {
    cash: 'Cash',
    virement: 'Virement'
};

// Pages principales (dans l'adresse : #ajouter, #depenses, #tableau, #revenus)
const PAGES = ['ajouter', 'depenses', 'tableau', 'revenus'];

// Comptes (dans l'adresse : #revenus/banque, #revenus/cash)
const ACCOUNTS = {
    banque: { method: 'virement', label: 'Banque (virement)' },
    cash: { method: 'cash', label: 'Espèces (cash)' }
};
const ACCOUNT_KEYS = Object.keys(ACCOUNTS);

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const CATEGORY_COLORS = {
    Alimentation: '#f59e0b',
    Transport: '#3b82f6',
    Loisirs: '#ec4899',
    Factures: '#ef4444',
    Autre: '#8b5cf6'
};
const FALLBACK_COLORS = ['#14b8a6', '#84cc16', '#f97316', '#06b6d4', '#a855f7', '#64748b'];

/* ---------- Utilitaires ---------- */

// Date du jour au format ISO local (AAAA-MM-JJ), sans décalage de fuseau horaire
function todayISO() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

// Convertit "JJ/MM/AAAA" en "AAAA-MM-JJ". Renvoie null si le format est invalide.
function frToISO(str) {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
    if (!match) return null;
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

// Comme frToISO, mais vérifie aussi que la date existe (pas de 31/02/2026)
function parseFrDate(str) {
    const iso = frToISO(String(str).trim());
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (y < 1900 || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return iso;
}

// AAAA-MM-JJ -> JJ/MM/AAAA
function isoToFr(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

// Affiche une date ISO en français (AAAA-MM-JJ -> JJ/MM/AAAA)
function formatDate(iso) {
    return isoToFr(iso);
}

function formatMoney(n) {
    return n.toLocaleString('fr-FR');
}

function formatPercent(p) {
    return p.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
}

// Sécurité basique pour éviter l'injection de code HTML
function escapeHtml(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function generateId(list) {
    let id = Date.now();
    while (list.some(item => item.id === id)) id++;
    return id;
}

// Message de confirmation (ou d'erreur) qui disparaît tout seul
function showFeedback(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('error', isError);
    clearTimeout(element._timer);
    element._timer = setTimeout(() => { element.textContent = ''; }, 2500);
}

function sum(list) {
    return list.reduce((total, item) => total + item.amount, 0);
}

/* ---------- Champs : montants en chiffres uniquement ---------- */

// Tout ce qui n'est pas un chiffre est supprimé (frappe, collage...)
document.querySelectorAll('.digits-only').forEach(input => {
    input.addEventListener('input', () => {
        const cleaned = input.value.replace(/\D/g, '');
        if (cleaned !== input.value) input.value = cleaned;
    });
});

// Montant strictement positif, ou null
function parseAmount(value) {
    const text = String(value).trim();
    if (text === '') return null;
    const amount = Number(text);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/* ---------- Champs : dates au format JJ/MM/AAAA ---------- */

// Signale une date invalide (le formulaire refuse alors l'envoi)
function updateDateValidity(input) {
    const invalid = input.value.trim() !== '' && parseFrDate(input.value) === null;
    input.setCustomValidity(invalid ? 'Date invalide. Format attendu : JJ/MM/AAAA' : '');
}

// Écrit une date ISO dans un champ (affichée en JJ/MM/AAAA)
function setDateInput(input, iso) {
    input.value = iso ? isoToFr(iso) : '';
    updateDateValidity(input);
}

document.querySelectorAll('.date-field').forEach(field => {
    const input = field.querySelector('input');

    // Ajoute automatiquement les "/" pendant la saisie : 12102026 -> 12/10/2026
    input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '').slice(0, 8);
        let text = digits.slice(0, 2);
        if (digits.length > 2) text += '/' + digits.slice(2, 4);
        if (digits.length > 4) text += '/' + digits.slice(4);
        input.value = text;
        updateDateValidity(input);
    });

    field.querySelector('.calendar-btn').addEventListener('click', () => openCalendar(input));
});

/* ---------- Calendrier ---------- */

let calendarTarget = null;
let calendarYear = 0;
let calendarMonth = 0;

function renderCalendar() {
    $('cal-title').textContent = `${MONTHS[calendarMonth]} ${calendarYear}`;

    const selected = calendarTarget ? parseFrDate(calendarTarget.value) : null;
    const today = todayISO();
    const year = String(calendarYear).padStart(4, '0');
    const month = String(calendarMonth + 1).padStart(2, '0');

    // Semaine commençant le lundi
    const offset = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    let html = '<span></span>'.repeat(offset);
    for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${year}-${month}-${String(day).padStart(2, '0')}`;
        const classes = 'cal-day' + (iso === today ? ' today' : '') + (iso === selected ? ' selected' : '');
        html += `<button type="button" class="${classes}" data-iso="${iso}" aria-label="${day} ${MONTHS[calendarMonth].toLowerCase()} ${calendarYear}">${day}</button>`;
    }
    $('cal-grid').innerHTML = html;
}

function openCalendar(input) {
    calendarTarget = input;
    // Le calendrier s'ouvre sur la date déjà saisie, sinon sur aujourd'hui
    const [y, m] = (parseFrDate(input.value) || todayISO()).split('-').map(Number);
    calendarYear = y;
    calendarMonth = m - 1;
    renderCalendar();
    $('calendar-modal').hidden = false;

    const focusTarget = $('cal-grid').querySelector('.selected, .today') || $('cal-grid').querySelector('.cal-day');
    if (focusTarget) focusTarget.focus();
}

function closeCalendar() {
    $('calendar-modal').hidden = true;
    calendarTarget = null;
}

function pickDate(iso) {
    if (!calendarTarget) return;
    calendarTarget.value = isoToFr(iso);
    // Déclenche la mise en forme et la vérification du champ
    calendarTarget.dispatchEvent(new Event('input', { bubbles: true }));
    closeCalendar();
}

$('calendar-modal').querySelectorAll('.cal-nav').forEach(btn => {
    btn.addEventListener('click', () => {
        const date = new Date(calendarYear, calendarMonth + Number(btn.dataset.nav), 1);
        calendarYear = date.getFullYear();
        calendarMonth = date.getMonth();
        renderCalendar();
    });
});

$('cal-grid').addEventListener('click', e => {
    const day = e.target.closest('.cal-day');
    if (day) pickDate(day.dataset.iso);
});
$('cal-today').addEventListener('click', () => pickDate(todayISO()));
$('cal-close').addEventListener('click', closeCalendar);
$('calendar-modal').addEventListener('click', e => {
    if (e.target === $('calendar-modal')) closeCalendar();
});

/* ---------- Stockage ---------- */

function isISODate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function normalizeDate(value) {
    const date = String(value || '');
    if (isISODate(date)) return date;
    return frToISO(date) || todayISO();
}

function normalizeExpense(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount)) return null;

    return {
        id: raw.id ?? fallbackId,
        date: normalizeDate(raw.date),
        description: String(raw.description ?? ''),
        amount,
        category: String(raw.category ?? 'Autre'),
        // Les anciennes dépenses sans mode de paiement sont considérées en cash
        method: raw.method === 'virement' ? 'virement' : 'cash'
    };
}

// source : 'retrait' = argent retiré du compte bancaire (uniquement pour les espèces), sinon 'autre'
function normalizeIncome(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount)) return null;

    const method = raw.method === 'cash' ? 'cash' : 'virement';
    return {
        id: raw.id ?? fallbackId,
        date: normalizeDate(raw.date),
        description: String(raw.description ?? ''),
        amount,
        method,
        source: method === 'cash' && raw.source === 'retrait' ? 'retrait' : 'autre'
    };
}

// Charge une liste de façon sécurisée (données corrompues = liste vide)
function loadList(key, normalizer) {
    try {
        const data = JSON.parse(localStorage.getItem(key));
        if (!Array.isArray(data)) return [];
        const base = Date.now();
        return data.map((item, i) => normalizer(item, base + i)).filter(Boolean);
    } catch (err) {
        console.error('Lecture du stockage impossible :', err);
        return [];
    }
}

function saveList(key, list) {
    try {
        localStorage.setItem(key, JSON.stringify(list));
    } catch (err) {
        console.error('Sauvegarde impossible :', err);
        alert("Impossible d'enregistrer les données sur cet appareil.");
    }
}

function loadMode() {
    try {
        return localStorage.getItem(KEYS.mode) === 'virement' ? 'virement' : 'cash';
    } catch (err) {
        return 'cash';
    }
}

function saveMode(mode) {
    try {
        localStorage.setItem(KEYS.mode, mode);
    } catch (err) {
        console.error('Sauvegarde impossible :', err);
    }
}

// Solde bancaire de référence : { date: 'AAAA-MM-JJ', amount: nombre } ou null
function loadBankReference() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEYS.bank));
        if (!raw || typeof raw !== 'object') return null;
        const amount = Number(raw.amount);
        if (!Number.isFinite(amount) || !isISODate(raw.date)) return null;
        return { date: raw.date, amount };
    } catch (err) {
        return null;
    }
}

function saveBankReference(ref) {
    try {
        if (ref) {
            localStorage.setItem(KEYS.bank, JSON.stringify(ref));
        } else {
            localStorage.removeItem(KEYS.bank);
        }
    } catch (err) {
        console.error('Sauvegarde impossible :', err);
        alert("Impossible d'enregistrer les données sur cet appareil.");
    }
}

let expenses = loadList(KEYS.expenses, normalizeExpense);
let incomes = loadList(KEYS.incomes, normalizeIncome);
let paymentMode = loadMode();
let bankReference = loadBankReference();

// Réécrit les données au format actuel (migration automatique)
saveList(KEYS.expenses, expenses);
saveList(KEYS.incomes, incomes);

/* ---------- Mode de paiement (Cash / Virement) ---------- */

const modeButtons = document.querySelectorAll('.mode-btn');

function setMode(mode) {
    paymentMode = mode;
    saveMode(mode);

    // Change les couleurs (fond + boutons) : voir style.css, body[data-mode]
    document.body.dataset.mode = mode;

    modeButtons.forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
    $('mode-label').textContent = METHOD_LABELS[mode];
}

modeButtons.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

/* ---------- Menu coulissant ---------- */

const menuBtn = $('menu-btn');
const drawer = $('drawer');
const overlay = $('overlay');

function openMenu() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Fermer le menu');
}

function closeMenu() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Ouvrir le menu');
}

menuBtn.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeMenu() : openMenu();
});
overlay.addEventListener('click', closeMenu);
drawer.addEventListener('click', e => {
    if (e.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Échap ferme d'abord le calendrier, puis le reste
    if (!$('calendar-modal').hidden) {
        closeCalendar();
        return;
    }
    closeMenu();
    closeEdit();
});

/* ---------- Navigation entre les pages ---------- */
/* Adresses : #ajouter  #depenses  #tableau  #tableau/Transport  #revenus  #revenus/banque  #revenus/cash */

function parseHash() {
    const [name, ...rest] = location.hash.slice(1).split('/');
    let param = rest.join('/');
    try {
        param = decodeURIComponent(param);
    } catch (err) {
        param = '';
    }
    return {
        page: PAGES.includes(name) ? name : 'ajouter',
        param
    };
}

// Clé du compte affiché ('banque' ou 'cash'), ou null
function currentAccountKey() {
    const { page, param } = parseHash();
    return page === 'revenus' && ACCOUNT_KEYS.includes(param) ? param : null;
}

function showPage() {
    const { page } = parseHash();
    const view = currentAccountKey() ? 'compte' : page;

    renderExpenseTable();
    renderAccount();

    [...PAGES, 'compte'].forEach(p => {
        $('page-' + p).hidden = p !== view;
    });

    // Dans le menu : le tableau fait partie des dépenses, le détail d'un compte des revenus
    const menuPage = view === 'tableau' ? 'depenses' : view === 'compte' ? 'revenus' : view;
    drawer.querySelectorAll('a').forEach(link => {
        link.classList.toggle('active', link.dataset.page === menuPage);
    });

    window.scrollTo(0, 0);
}

window.addEventListener('hashchange', showPage);

/* ---------- Graphique en cercle des dépenses ---------- */

function categoryHref(category) {
    return '#tableau/' + encodeURIComponent(category);
}

function renderChart() {
    // Total par catégorie, de la plus grosse à la plus petite
    const totals = {};
    expenses.forEach(e => {
        totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    const entries = Object.entries(totals)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, value]) => acc + value, 0);

    const container = $('chart-container');
    const legend = $('chart-legend');
    $('chart-total').textContent = formatMoney(total);

    if (entries.length === 0) {
        container.innerHTML = '';
        legend.innerHTML = '';
        $('chart-empty').style.display = 'block';
        return;
    }
    $('chart-empty').style.display = 'none';

    let fallbackIndex = 0;
    const colorFor = category =>
        CATEGORY_COLORS[category] || FALLBACK_COLORS[fallbackIndex++ % FALLBACK_COLORS.length];

    const cx = 100, cy = 100, r = 92;
    let angle = -Math.PI / 2;
    let slices = '';
    let legendHtml = '';

    entries.forEach(([category, value]) => {
        const fraction = value / total;
        const percent = fraction * 100;
        const color = colorFor(category);
        const name = escapeHtml(category);
        const href = categoryHref(category);
        const label = `${name} : ${formatPercent(percent)}, voir les dépenses`;
        let shape;
        let text = '';

        if (entries.length === 1) {
            // Un seul élément : cercle complet
            shape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
            text = `<text x="${cx}" y="${cy}">100%</text>`;
        } else {
            const end = angle + fraction * 2 * Math.PI;
            const x1 = cx + r * Math.cos(angle);
            const y1 = cy + r * Math.sin(angle);
            const x2 = cx + r * Math.cos(end);
            const y2 = cy + r * Math.sin(end);
            const large = fraction > 0.5 ? 1 : 0;
            shape = `<path d="M${cx} ${cy} L${x1.toFixed(3)} ${y1.toFixed(3)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z" fill="${color}"/>`;

            // Pourcentage affiché sur la part (si elle est assez grande)
            if (fraction >= 0.06) {
                const mid = angle + fraction * Math.PI;
                const lx = cx + r * 0.62 * Math.cos(mid);
                const ly = cy + r * 0.62 * Math.sin(mid);
                text = `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}">${Math.round(percent)}%</text>`;
            }
            angle = end;
        }

        slices += `<a href="${href}" class="slice" aria-label="${label}"><title>${name} : ${formatPercent(percent)}</title>${shape}${text}</a>`;

        legendHtml += `
            <li>
                <a href="${href}">
                    <span class="swatch" style="background:${color}"></span>
                    <span class="legend-name">${name}</span>
                    <span class="legend-value">${formatMoney(value)} · ${formatPercent(percent)}</span>
                </a>
            </li>
        `;
    });

    container.innerHTML = `<svg viewBox="0 0 200 200" role="img" aria-label="Répartition des dépenses par catégorie">${slices}</svg>`;
    legend.innerHTML = legendHtml;
}

/* ---------- Lignes de dépenses (cliquables pour modifier) ---------- */

function sortedNewestFirst(list) {
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function expenseRow(expense, { showMethod, ignored = false }) {
    const row = document.createElement('tr');
    row.className = 'clickable' + (ignored ? ' ignored' : '');
    row.dataset.id = expense.id;
    row.tabIndex = 0;
    row.title = 'Cliquer pour modifier';
    row.innerHTML = `
        <td>${formatDate(expense.date)}</td>
        <td>${escapeHtml(expense.description)}</td>
        <td>${escapeHtml(expense.category)}</td>
        ${showMethod ? `<td>${METHOD_LABELS[expense.method]}</td>` : ''}
        <td>${formatMoney(expense.amount)}</td>
        <td><button type="button" class="delete-btn" data-id="${expense.id}" aria-label="Supprimer cette dépense">×</button></td>
    `;
    return row;
}

function onExpenseListClick(e) {
    // Bouton × : suppression
    const del = e.target.closest('.delete-btn');
    if (del) {
        const id = Number(del.dataset.id);
        expenses = expenses.filter(expense => expense.id !== id);
        saveList(KEYS.expenses, expenses);
        renderAll();
        return;
    }
    // Clic sur la ligne : modification
    const row = e.target.closest('tr[data-id]');
    if (row) openEdit(Number(row.dataset.id));
}

function onExpenseListKeydown(e) {
    if (e.key === 'Enter' && e.target.matches('tr[data-id]')) {
        openEdit(Number(e.target.dataset.id));
    }
}

['expense-list', 'account-expense-list'].forEach(id => {
    $(id).addEventListener('click', onExpenseListClick);
    $(id).addEventListener('keydown', onExpenseListKeydown);
});

/* ---------- Tableau des dépenses (filtré par catégorie) ---------- */

// Liste déroulante : catégories du formulaire + celles déjà utilisées
function populateCategoryFilter(selected) {
    const categories = [...$('category').options].map(o => o.value);
    expenses.forEach(e => {
        if (!categories.includes(e.category)) categories.push(e.category);
    });
    if (selected && !categories.includes(selected)) categories.push(selected);

    const select = $('category-filter');
    select.innerHTML =
        '<option value="">Toutes les catégories</option>' +
        categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    select.value = selected;
}

function renderExpenseTable() {
    const { page, param } = parseHash();
    // Le filtre ne s'applique que sur la page du tableau
    const filter = page === 'tableau' ? param : '';

    populateCategoryFilter(filter);

    const visible = sortedNewestFirst(
        filter ? expenses.filter(e => e.category === filter) : expenses
    );
    const list = $('expense-list');
    list.innerHTML = '';
    let total = 0;

    if (visible.length === 0) {
        $('empty-msg').textContent = filter
            ? 'Aucune dépense dans cette catégorie.'
            : 'Aucune dépense enregistrée pour le moment.';
        $('empty-msg').style.display = 'block';
    } else {
        $('empty-msg').style.display = 'none';
        visible.forEach(expense => {
            total += expense.amount;
            list.appendChild(expenseRow(expense, { showMethod: true }));
        });
    }

    $('total-label').textContent = filter ? `Total (${filter})` : 'Total';
    $('total-amount').textContent = formatMoney(total);
}

// Changer de catégorie dans la liste met à jour l'adresse (et donc le tableau)
$('category-filter').addEventListener('change', e => {
    const value = e.target.value;
    location.hash = value ? categoryHref(value) : '#tableau';
});

/* ---------- Soldes des comptes ---------- */

// Pour la banque, seules les opérations à partir de la date de référence comptent
function isBeforeReference(key, item) {
    return key === 'banque' && bankReference !== null && item.date < bankReference.date;
}

// Retraits : espèces provenant du compte bancaire
function withdrawalsList() {
    return incomes.filter(i => i.method === 'cash' && i.source === 'retrait');
}

/*
  Banque  : solde initial + revenus (virements reçus) - dépenses (virement) - retraits
  Espèces : revenus (autres) + retraits reçus de la banque - dépenses (cash)
*/
function computeAccount(key) {
    const counted = list => list.filter(item => !isBeforeReference(key, item));

    if (key === 'banque') {
        const initial = bankReference ? bankReference.amount : 0;
        const income = sum(counted(incomes.filter(i => i.method === 'virement')));
        const expense = sum(counted(expenses.filter(e => e.method === 'virement')));
        const withdrawals = sum(counted(withdrawalsList()));
        return { initial, income, expense, withdrawals, balance: initial + income - expense - withdrawals };
    }

    const income = sum(incomes.filter(i => i.method === 'cash' && i.source !== 'retrait'));
    const expense = sum(expenses.filter(e => e.method === 'cash'));
    const withdrawals = sum(withdrawalsList());
    return { initial: 0, income, expense, withdrawals, balance: income + withdrawals - expense };
}

// Les deux comptes côte à côte (page « Revenus et soldes »)
function renderTiles() {
    let total = 0;

    [['banque', 'bank'], ['cash', 'cash']].forEach(([key, prefix]) => {
        const account = computeAccount(key);
        total += account.balance;

        const balanceEl = $(`tile-${prefix}-balance`);
        balanceEl.textContent = formatMoney(account.balance);
        balanceEl.classList.toggle('negative', account.balance < 0);
        $(`tile-${prefix}-income`).textContent = formatMoney(account.income);
    });

    $('total-balance').textContent = formatMoney(total);
}

function balanceCell(value) {
    const cls = value < 0 ? 'negative' : 'positive';
    return `<td class="${cls}">${formatMoney(value)}</td>`;
}

// Ligne d'un revenu (ou d'un retrait) avec son bouton de suppression
function incomeRow(item, { ignored = false } = {}) {
    const row = document.createElement('tr');
    if (ignored) row.className = 'ignored';
    const badge = item.source === 'retrait' ? '<span class="badge">Retrait bancaire</span>' : '';
    row.innerHTML = `
        <td>${formatDate(item.date)}</td>
        <td>${escapeHtml(item.description)}${badge}</td>
        <td>${formatMoney(item.amount)}</td>
        <td><button type="button" class="delete-btn" data-id="${item.id}" aria-label="Supprimer cette ligne">×</button></td>
    `;
    return row;
}

// Détail d'un compte (banque ou espèces)
function renderAccount() {
    const key = currentAccountKey();
    if (!key) return;

    const account = ACCOUNTS[key];
    const isBank = key === 'banque';
    const { initial, income, expense, withdrawals, balance } = computeAccount(key);

    $('account-title').textContent = account.label;
    $('bank-card').hidden = !isBank;
    $('withdrawals-card').hidden = !isBank;

    // Tableau récapitulatif (colonnes dans l'ordre logique de chaque compte)
    const columns = isBank
        ? [['Solde initial', initial], ['Revenus', income], ['Dépenses', expense], ['Retraits', withdrawals]]
        : [['Solde initial', initial], ['Revenus', income], ['Retraits reçus', withdrawals], ['Dépenses', expense]];

    $('account-summary-head').innerHTML =
        columns.map(([label]) => `<th>${label}</th>`).join('') + '<th>Solde</th>';
    $('account-summary-body').innerHTML =
        `<tr>${columns.map(([, value]) => `<td>${formatMoney(value)}</td>`).join('')}${balanceCell(balance)}</tr>`;

    // Formulaire d'ajout : sur les espèces, on choisit la provenance
    $('income-source-group').hidden = isBank;
    const isWithdrawal = !isBank && $('income-source').value === 'retrait';
    $('income-title').textContent = isBank ? 'Ajouter un revenu' : 'Ajouter des espèces';
    $('income-submit').textContent = isBank ? 'Enregistrer le revenu' : 'Enregistrer';
    $('income-description').required = !isWithdrawal;
    $('income-description').placeholder = isWithdrawal ? 'Facultatif (ex: Distributeur)' : 'Ex: Salaire';
    $('income-target').textContent = isBank
        ? `Ce revenu sera ajouté au compte : ${account.label}.`
        : isWithdrawal
            ? 'Le montant sera ajouté à tes espèces et retiré de ton solde bancaire.'
            : 'Le montant sera ajouté à tes espèces uniquement (vente, cadeau, monnaie...).';

    // Revenus de ce compte
    const accountIncomes = sortedNewestFirst(incomes.filter(i => i.method === account.method));
    const incomeList = $('income-list');
    incomeList.innerHTML = '';
    accountIncomes.forEach(item => {
        incomeList.appendChild(incomeRow(item, { ignored: isBeforeReference(key, item) }));
    });
    $('income-empty').style.display = accountIncomes.length ? 'none' : 'block';

    // Retraits vers les espèces (banque uniquement)
    const withdrawalList = $('withdrawal-list');
    withdrawalList.innerHTML = '';
    if (isBank) {
        const items = sortedNewestFirst(withdrawalsList());
        items.forEach(item => {
            withdrawalList.appendChild(incomeRow(item, { ignored: isBeforeReference(key, item) }));
        });
        $('withdrawal-empty').style.display = items.length ? 'none' : 'block';
    }

    // Dépenses de ce compte
    const accountExpenses = sortedNewestFirst(expenses.filter(e => e.method === account.method));
    const expenseList = $('account-expense-list');
    expenseList.innerHTML = '';
    accountExpenses.forEach(item => {
        expenseList.appendChild(expenseRow(item, {
            showMethod: false,
            ignored: isBeforeReference(key, item)
        }));
    });
    $('account-expense-empty').style.display = accountExpenses.length ? 'none' : 'block';

    // Note explicative
    let note;
    if (isBank && bankReference) {
        note = `Solde de ${formatMoney(bankReference.amount)} au ${formatDate(bankReference.date)}, puis les opérations à partir de cette date.`;
        const hasIgnored = [...incomes, ...expenses].some(
            item => (item.method === 'virement' || item.source === 'retrait') && isBeforeReference(key, item)
        );
        if (hasIgnored) note += ' Les lignes grisées sont antérieures à cette date et ne sont pas comptées.';
    } else if (isBank) {
        note = 'Aucun solde de référence défini : toutes les opérations sont comptées.';
    } else {
        note = 'Revenus et retraits reçus de la banque, moins les dépenses payées en cash.';
    }
    $('account-note').textContent = note;
}

// Changer la provenance met à jour le formulaire (description facultative pour un retrait)
$('income-source').addEventListener('change', renderAccount);

/* ---------- Solde bancaire de référence (formulaire) ---------- */

function fillBankForm() {
    setDateInput($('bank-date'), bankReference ? bankReference.date : todayISO());
    $('bank-amount').value = bankReference ? bankReference.amount : '';
    $('bank-clear').hidden = !bankReference;
}

$('bank-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const date = parseFrDate($('bank-date').value);
    const rawAmount = $('bank-amount').value.trim();
    const amount = Number(rawAmount);

    if (!date) {
        showFeedback($('bank-feedback'), 'Date invalide (format JJ/MM/AAAA)', true);
        return;
    }
    if (rawAmount === '' || !Number.isFinite(amount)) return;

    bankReference = { date, amount };
    saveBankReference(bankReference);
    renderAll();
    fillBankForm();
    showFeedback($('bank-feedback'), 'Solde bancaire enregistré');
});

$('bank-clear').addEventListener('click', () => {
    bankReference = null;
    saveBankReference(null);
    renderAll();
    fillBankForm();
    showFeedback($('bank-feedback'), 'Solde de référence retiré');
});

/* ---------- Affichage global ---------- */

function renderAll() {
    renderChart();
    renderExpenseTable();
    renderTiles();
    renderAccount();
}

/* ---------- Ajout d'une dépense ---------- */

$('expense-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const description = $('description').value.trim();
    const amount = parseAmount($('amount').value);
    // Pas de date saisie : on prend la date du jour
    const rawDate = $('expense-date').value.trim();
    const date = rawDate === '' ? todayISO() : parseFrDate(rawDate);

    if (!description || amount === null) return;
    if (!date) {
        showFeedback($('expense-feedback'), 'Date invalide (format JJ/MM/AAAA)', true);
        return;
    }

    expenses.push({
        id: generateId(expenses),
        date,
        description,
        amount,
        category: $('category').value,
        method: paymentMode
    });

    saveList(KEYS.expenses, expenses);
    renderAll();
    this.reset();
    updateDateValidity($('expense-date'));
    showFeedback($('expense-feedback'), `Dépense enregistrée (${METHOD_LABELS[paymentMode]})`);
});

/* ---------- Modification d'une dépense ---------- */

let editingId = null;

function openEdit(id) {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    editingId = id;

    // Catégories du formulaire d'ajout (+ celle de la dépense si elle est différente)
    const categories = [...$('category').options].map(o => o.value);
    if (!categories.includes(expense.category)) categories.push(expense.category);
    $('edit-category').innerHTML = categories
        .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
        .join('');

    $('edit-description').value = expense.description;
    $('edit-amount').value = expense.amount;
    setDateInput($('edit-date'), expense.date);
    $('edit-category').value = expense.category;
    $('edit-method').value = expense.method;

    $('edit-modal').hidden = false;
    $('edit-amount').focus();
}

function closeEdit() {
    $('edit-modal').hidden = true;
    editingId = null;
}

$('edit-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const expense = expenses.find(item => item.id === editingId);
    if (!expense) return closeEdit();

    const description = $('edit-description').value.trim();
    const amount = parseAmount($('edit-amount').value);
    const date = parseFrDate($('edit-date').value);

    if (!description || amount === null || !date) return;

    expense.description = description;
    expense.amount = amount;
    expense.date = date;
    expense.category = $('edit-category').value;
    expense.method = $('edit-method').value === 'virement' ? 'virement' : 'cash';

    saveList(KEYS.expenses, expenses);
    closeEdit();
    renderAll();
});

$('edit-cancel').addEventListener('click', closeEdit);

// Clic sur le fond sombre : ferme la fenêtre
$('edit-modal').addEventListener('click', e => {
    if (e.target === $('edit-modal')) closeEdit();
});

/* ---------- Ajout / suppression d'un revenu ou d'un retrait ---------- */

$('income-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const key = currentAccountKey();
    if (!key) return;

    const isCash = key === 'cash';
    const source = isCash && $('income-source').value === 'retrait' ? 'retrait' : 'autre';

    let description = $('income-description').value.trim();
    if (!description && source === 'retrait') description = 'Retrait bancaire';
    const amount = parseAmount($('income-amount').value);

    if (!description || amount === null) return;

    incomes.push({
        id: generateId(incomes),
        date: todayISO(),
        description,
        amount,
        method: ACCOUNTS[key].method,
        source
    });

    saveList(KEYS.incomes, incomes);
    this.reset();
    renderAll();
    showFeedback($('income-feedback'),
        source === 'retrait' ? 'Retrait enregistré' : isCash ? 'Espèces ajoutées' : 'Revenu enregistré');
});

function onIncomeListClick(e) {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    incomes = incomes.filter(income => income.id !== id);
    saveList(KEYS.incomes, incomes);
    renderAll();
}

$('income-list').addEventListener('click', onIncomeListClick);
$('withdrawal-list').addEventListener('click', onIncomeListClick);

/* ---------- Démarrage ---------- */

setMode(paymentMode);
fillBankForm();
renderAll();
showPage();
