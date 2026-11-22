/**
 * Volako : reçoit les photos des dépenses et les range dans ton Google Drive.
 *
 * Installation (une seule fois) : voir google-apps-script/LISEZMOI.md
 *
 * Les photos vont dans « Volako / <catégorie> / ». L'application ne garde que le lien renvoyé.
 * Quand une dépense est supprimée, sa photo part dans la corbeille du Drive (récupérable 30 jours).
 */

// Clé secrète : remplace-la par celle affichée dans Volako (Comptes → Photos Google Drive).
// Sans elle, n'importe qui connaissant l'adresse du script pourrait déposer des fichiers dans ton Drive.
const SECRET = 'COLLE-ICI-LA-CLE-DE-VOLAKO';

const ROOT_FOLDER = 'Volako';

// Version du script : Volako la vérifie au test de connexion pour savoir si le déploiement est à jour
const VERSION = 2;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return reply({ ok: false, error: 'Clé secrète incorrecte' });

    // Test de connexion depuis l'application
    if (body.ping) return reply({ ok: true, version: VERSION });

    if (body.action === 'trash') return trash(body.url);

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
