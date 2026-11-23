/**
 * Volako : reçoit les photos des dépenses et les range dans ton Google Drive.
 *
 * Installation (une seule fois) : voir google-apps-script/LISEZMOI.md
 *
 * Les photos vont dans « Volako / <catégorie> / ». L'application ne garde que le lien renvoyé.
 * Quand une dépense est supprimée, sa photo part dans la corbeille du Drive (récupérable 30 jours).
 *
 * Synchronisation téléphone ↔ PC : les données de Volako sont aussi gardées dans « Volako / volako-donnees.json »,
 * avec une copie lisible « Volako / Volako.csv » (Excel, Google Sheets).
 */

// Clé secrète : remplace-la par celle affichée dans Volako (Comptes → Photos Google Drive).
// Sans elle, n'importe qui connaissant l'adresse du script pourrait déposer des fichiers dans ton Drive.
const SECRET = 'COLLE-ICI-LA-CLE-DE-VOLAKO';

const ROOT_FOLDER = 'Volako';

// Version du script : Volako la vérifie au test de connexion pour savoir si le déploiement est à jour
const VERSION = 3;

const DATA_FILE = 'volako-donnees.json';
const CSV_FILE = 'Volako.csv';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return reply({ ok: false, error: 'Clé secrète incorrecte' });

    // Test de connexion depuis l'application
    if (body.ping) return reply({ ok: true, version: VERSION });

    if (body.action === 'trash') return trash(body.url);
    if (body.action === 'pull') return pull();
    if (body.action === 'push') return push(body);

    const root = folder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const dir = folder(root, body.category || 'Hors budget');
    const blob = Utilities.newBlob(Utilities.base64Decode(body.data), body.mimeType || 'image/jpeg', body.name);
    const file = dir.createFile(blob);
    if (body.description) file.setDescription(body.description);
    return reply({ ok: true, url: file.getUrl() });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

/** Renvoie le fichier de données tel quel (null s'il n'existe pas encore) */
function pull() {
  const file = findFile(folder(DriveApp.getRootFolder(), ROOT_FOLDER), DATA_FILE);
  return reply({ ok: true, data: file ? file.getBlob().getDataAsString('UTF-8') : null });
}

/**
 * Enregistre les données fusionnées par l'appli, et la copie CSV.
 * Refuse si un autre appareil a enregistré entre-temps (body.base ne correspond plus) : l'appli refusionne.
 */
function push(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const root = folder(DriveApp.getRootFolder(), ROOT_FOLDER);
    const current = findFile(root, DATA_FILE);
    const currentSavedAt = current ? (JSON.parse(current.getBlob().getDataAsString('UTF-8')).savedAt || null) : null;
    if (currentSavedAt !== (body.base || null)) return reply({ ok: false, conflict: true, error: 'Données modifiées par un autre appareil' });
    writeFile(root, DATA_FILE, body.data, 'application/json');
    if (body.csv) writeFile(root, CSV_FILE, body.csv, 'text/csv');
    return reply({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function findFile(dir, name) {
  const found = dir.getFilesByName(name);
  return found.hasNext() ? found.next() : null;
}

function writeFile(dir, name, content, mimeType) {
  const file = findFile(dir, name);
  if (file) file.setContent(content);
  else dir.createFile(name, content, mimeType);
}

/** Met la photo à la corbeille, seulement si elle est rangée dans le dossier Volako */
function trash(url) {
  const id = /\/d\/([-\w]+)/.exec(String(url) || '');
  if (!id) return reply({ ok: false, error: 'Lien de photo invalide' });
  let file;
  try {
    file = DriveApp.getFileById(id[1]);
  } catch (err) {
    // Déjà supprimée : rien à faire
    return reply({ ok: true });
  }
  if (!insideVolako(file)) return reply({ ok: false, error: 'Ce fichier n’est pas dans le dossier Volako' });
  file.setTrashed(true);
  return reply({ ok: true });
}

/** Vrai si le fichier est dans « Volako » ou l'un de ses sous-dossiers */
function insideVolako(file) {
  let parents = file.getParents();
  while (parents.hasNext()) {
    const dir = parents.next();
    if (dir.getName() === ROOT_FOLDER) return true;
    parents = dir.getParents();
  }
  return false;
}

/** Dossier enfant du nom donné, créé s'il n'existe pas */
function folder(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
