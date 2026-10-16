// Libera à mão um pedido que o jogador já pagou mas não foi confirmado (ex.: a chave da AbacatePay sem permissão de leitura).
// Confira o pagamento no painel da AbacatePay antes. Rode na pasta do app, como o dono do banco:
//   runuser -u avenida -- node --env-file=.env deploy/liberar-pedido.mjs            # lista os pedidos não pagos
//   runuser -u avenida -- node --env-file=.env deploy/liberar-pedido.mjs ID_DO_PEDIDO  # libera o item
import { db } from '../server/db.js';
import { fulfill, getOrder } from '../server/shop.js';

db.exec('PRAGMA busy_timeout = 5000');
const id = process.argv[2];

if (!id) {
  const rows = db.prepare(`
    SELECT o.id, o.status, o.amount_cents, o.item_id, o.created_at, u.nick, u.email
    FROM orders o JOIN users u ON u.id = o.user_id
    WHERE o.status != 'paid' ORDER BY o.created_at DESC LIMIT 20`).all();
  if (!rows.length) console.log('Nenhum pedido pendente.');
  for (const r of rows) {
    console.log(`${r.id}  ${r.status.padEnd(9)} R$ ${(r.amount_cents / 100).toFixed(2).padStart(7)}  ${r.item_id.padEnd(16)} ${new Date(r.created_at).toLocaleString('pt-BR')}  ${r.nick} <${r.email}>`);
  }
  process.exit(0);
}

const order = getOrder(id);
if (!order) { console.error('Pedido não encontrado.'); process.exit(1); }
if (order.status === 'paid') { console.log('Esse pedido já está pago e liberado.'); process.exit(0); }
console.log(fulfill(id) ? `Pedido ${id} liberado (${order.item_id}). O jogador vê o item ao recarregar o jogo.` : 'Não foi possível liberar o pedido.');
