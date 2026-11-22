# Relier Volako à Google Drive

Le script `Code.gs` reçoit les photos envoyées par Volako et les range dans ton Drive,
dans `Volako / <catégorie> /`. Il tourne gratuitement chez Google, avec ton compte.

## 1. Créer le script

1. Va sur https://script.google.com et clique sur **Nouveau projet**.
2. Renomme le projet en **Volako Photos** (en haut à gauche).
3. Efface le contenu de `Code.gs` et colle à la place tout le contenu du fichier `Code.gs` de ce dossier.

## 2. Mettre la clé secrète

1. Dans Volako : **Comptes → Photos Google Drive**. Une clé secrète est affichée, copie-la.
2. Dans le script, remplace `COLLE-ICI-LA-CLE-DE-VOLAKO` par cette clé (garde les apostrophes).
3. Enregistre (icône disquette).

## 3. Publier le script

1. **Déployer → Nouveau déploiement**.
2. Type : **Application Web** (roue dentée à côté de « Sélectionner le type »).
3. **Exécuter en tant que : Moi**.
4. **Qui a accès : Tout le monde** (sinon le téléphone ne peut pas lui envoyer de photos ; la clé secrète protège l'accès).
5. **Déployer**, puis autorise l'accès à ton Drive quand Google le demande.
   Google affiche « Google n'a pas validé cette application » : c'est normal pour un script personnel,
   clique sur **Paramètres avancés → Accéder à Volako Photos**.
6. Copie l'**URL de l'application Web** (elle finit par `/exec`).

## 4. Dans Volako

Colle l'URL dans **Comptes → Photos Google Drive**, puis touche **Tester la connexion**.

## Si tu modifies le script plus tard

**Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer.**
L'URL reste la même.
