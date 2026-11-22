# Mon Budget (Angular)

Application de budget mensuel : dépenses en cash ou par virement, graphique par catégorie,
soldes de la banque et des espèces. Version Angular de l'application HTML/CSS/JS d'origine,
avec les mêmes fonctionnalités et le même rendu.

Écrite pour Angular 21 (composants standalone, signals, nouvelle syntaxe `@if` / `@for`),
compatible avec Angular 22.

## Lancer le projet

```bash
npm install
npm start          # http://localhost:4200
npm run build      # version de production dans dist/
```

Pour héberger dans un sous-dossier (GitHub Pages, par exemple) :
`npx ng build --base-href ./` (les adresses sont en `#/...`, aucune configuration serveur n'est nécessaire).

## Structure

```
src/app/
├── app.ts / app.html          Coquille : en-tête, menu coulissant, bouton Cash/Virement
├── app.routes.ts              Pages (adresses #/ajouter, #/depenses, #/tableau, #/revenus...)
├── app.config.ts              Routeur (hash, paramètres d'adresse -> input())
├── models.ts                  Types (Expense, Income...) et constantes (catégories, comptes)
├── utils.ts                   Dates (JJ/MM/AAAA), montants (virgule), tri
├── storage.ts                 Lecture / écriture localStorage (mêmes clés que la version HTML)
├── budget-store.ts            État de l'app (signals) : dépenses, revenus, soldes, sauvegarde auto
├── ui.service.ts              Fenêtre de modification d'une dépense (ouverte / fermée)
├── pipes.ts                   money (1 500,5) et frDate (13/10/2026)
├── feedback.ts                Messages de confirmation qui disparaissent
├── components/
│   ├── amount-field/          Champ montant : chiffres + virgule, 2 décimales
│   ├── date-field/            Champ date JJ/MM/AAAA + calendrier intégré
│   ├── expense-row/           Ligne de dépense (clic = modifier, × = supprimer)
│   ├── income-row/            Ligne de revenu / retrait
│   └── edit-expense-modal/    Fenêtre de modification d'une dépense
└── pages/
    ├── add-expense/           Ajouter une dépense
    ├── expenses-chart/        Graphique en cercle par catégorie
    ├── expenses-table/        Tableau des dépenses (filtre par catégorie)
    ├── accounts/              Banque et espèces côte à côte
    └── account-detail/        Détail d'un compte (solde bancaire à une date, revenus, retraits)
src/styles.css                 Styles globaux (identiques à la version HTML)
```

## Règles métier

- **Banque** = solde initial + revenus (virements) − dépenses (virement) − retraits en cash.
  Si un solde bancaire de référence est défini, seules les opérations à partir de sa date comptent
  (les lignes antérieures sont grisées).
- **Espèces** = revenus en espèces + retraits reçus de la banque − dépenses en cash.
- Une dépense sans date prend la date du jour. Les dates sont stockées en `AAAA-MM-JJ`
  et affichées en `JJ/MM/AAAA`.
- Les montants acceptent la virgule (2 décimales) ; une virgule sans chiffre derrière vaut 0.

## Données

Tout est enregistré dans le `localStorage` du navigateur (clés `expenses`, `incomes`,
`paymentMode`, `bankReference`). Rien n'est envoyé sur un serveur.
