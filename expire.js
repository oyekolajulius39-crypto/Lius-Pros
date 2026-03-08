const db = require('../db');

async function expireSubscriptions() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Get expiring subscriptions
    const { rows: expiring } = await client.query(
      `SELECT id, slot_id FROM subscriptions 
       WHERE status='active' AND expiry_date < CURRENT_DATE`
    );

    if (expiring.length === 0) {
      console.log('[EXPIRE] No subscriptions to expire.');
      await client.query('COMMIT');
      return;
    }

    const ids = expiring.map(s => s.id);
    const slotIds = expiring.map(s => s.slot_id).filter(Boolean);

    // Expire subscriptions
    await client.query(
      `UPDATE subscriptions SET status='expired', updated_at=NOW() WHERE id = ANY($1)`,
      [ids]
    );

    // Free up slots
    if (slotIds.length > 0) {
      await client.query(
        `UPDATE slots SET status='available', updated_at=NOW() WHERE id = ANY($1)`,
        [slotIds]
      );
    }

    await client.query('COMMIT');
    console.log(`[EXPIRE] Expired ${expiring.length} subscriptions, freed ${slotIds.length} slots.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[EXPIRE] Error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { expireSubscriptions };
