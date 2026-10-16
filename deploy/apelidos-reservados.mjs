// Lista as contas cujo apelido hoje seria recusado por imitar a equipe ou o sistema (Admin, Suporte, Moderador, Excluído…).
// Contas criadas antes da regra podem ter esses nomes. Com --renomear, troca cada uma por "Jogador<id>".
//   runuser -u avenida -- node --env-file=.env deploy/apelidos-reservados.mjs
//   runuser -u avenida -- node --env-file=.env deploy/apelidos-reservados.mjs --renomear
import { db } from '../server/db.js';
import { isReservedNick } from '../server/rules.js';

db.exec('PRAGMA busy_timeout = 5000');
const rename = process.argv.includes('--renomear');
const rows = db.prepare("SELECT id, nick, email FROM users WHERE nick NOT LIKE 'Excluído%'").all().filter((u) => isReservedNick(u.nick));
if (!rows.length) console.log('Nenhuma conta com apelido reservado.');
for (const u of rows) {
  if (rename) {
    db.prepare('UPDATE users SET nick = ? WHERE id = ?').run(`Jogador${u.id}`, u.id);
    console.log(`#${u.id} ${u.nick} <${u.email}> -> Jogador${u.id}`);
  } else {
    console.log(`#${u.id} ${u.nick} <${u.email}>`);
  }
}
if (rows.length && !rename) console.log('\nPara trocar por Jogador<id>: rode de novo com --renomear');
