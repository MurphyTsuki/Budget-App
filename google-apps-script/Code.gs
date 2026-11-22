/**
 * Volako : reçoit les photos des dépenses et les range dans ton Google Drive.
 *
 * Installation (une seule fois) : voir google-apps-script/LISEZMOI.md
 *
 * Les photos vont dans « Volako / <catégorie> / ». L'application ne garde que le lien renvoyé.
 */

// Clé secrète : remplace-la par celle affichée dans Volako (Comptes → Photos Google Drive).
// Sans elle, n'importe qui connaissant l'adresse du script pourrait déposer des fichiers dans ton Drive.
const SECRET = 'COLLE-ICI-LA-CLE-DE-VOLAKO';

const ROOT_FOLDER = 'Volako';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return reply({ ok: false, error: 'Clé secrète incorrecte' });

    // Test de connexion depuis l'application
    if (body.ping) return reply({ ok: true });

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

/** Dossier enfant du nom donné, créé s'il n'existe pas */
function folder(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
