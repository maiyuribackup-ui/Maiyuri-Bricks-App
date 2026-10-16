/**
 * Seed the Factory Ledger (factory_* tables) with the migrated Google-Sheet
 * data. Source of truth: the structured extract in
 *   C:\Users\Ram Kumaran\Documents\baserow-maiyuri\setup-baserow.ps1
 * transcribed here ONCE (arrays $productRows/$customerData/$orderData/
 * $prodData/$planData/$delData/$tripData/$labourData/$assetData).
 *
 * Idempotent: natural keys (code / name / date+product / asset+location) and
 * deterministic seed_key values elsewhere; every insert is ON CONFLICT DO
 * NOTHING, wrapped in one transaction.
 *
 * Run:  DATABASE_URL=postgresql://... node scripts/seed-factory-ledger.mjs
 * ('pg' must be resolvable — e.g. NODE_PATH=<dir with node_modules/pg>.)
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL env var is required');
  process.exit(1);
}

// ---------------------------------------------------------------- datasets

// Opening stock deliberately NULL: the physical stock-take has not happened.
// The UI shows a stock-take banner until opening_counted_at is set.
const PRODUCTS = [
  { code: 'MIB-8', notes: 'Mud interlock brick 8". Loading paid separately at Rs.3/brick.' },
  { code: 'MIB-6', notes: 'Mud interlock brick 6".' },
  { code: 'CIB-8', notes: 'Cement interlock brick 8".' },
  { code: 'CIB-6', notes: 'Cement interlock brick 6". July deliveries exceeded July production by 5,438 - enter the real 01-Jul opening count here.' },
];

const CUSTOMERS = [
  { name: 'KL Associates', location: '', notes: 'Sheet variants: KL ASSOCIATES, kl associates, KL-Associate.' },
  { name: 'Old Erumavettipalayam (Selvam)', location: 'Erumavettipalayam', notes: 'Weekly plan calls the same deliveries "RTO Site" - confirm whether these are one customer.' },
  { name: 'RTO Site', location: '', notes: 'POSSIBLE DUPLICATE of Old Erumavettipalayam (Selvam) - same dates and quantities in the weekly plan. Merge if confirmed.' },
  { name: 'Yuvaraj Sampath Construction', location: 'Moolakadai', notes: 'Sheet variants: Yuvaraj sambath construction, Sampath construction Yuvraj, YUVARAJ MOOLAKADAI.' },
  { name: 'Murali Perungavur', location: 'Perungavur', notes: 'Also spelled "murali sirungavur" in the daily sheet - treated as the same customer.' },
  { name: 'Siva Thamaraipakkam', location: 'Thamaraipakkam', notes: '' },
  { name: 'Gopalakrishnan Kodambakkam', location: 'Kodambakkam', notes: '' },
  { name: 'Arul Kundrathur', location: 'Kundrathur', notes: '' },
  { name: 'Bharani Shanmugam Kundrathur', location: 'Kundrathur', notes: 'Advance 1,200 recorded 31/07.' },
  { name: 'Umapathi Sriperumbudur', location: 'Sriperumbudur', notes: '' },
  { name: 'Asif Periyapalayam', location: 'Periyapalayam', notes: '' },
  { name: 'Padmanabhan (Kishore) Redhills', location: 'Redhills', notes: '' },
  { name: 'Jeevan Pattabiram', location: 'Pattabiram', notes: 'Advance 10,000 received 27/07.' },
  { name: 'Josep Ponneri', location: 'Ponneri', notes: '' },
  { name: 'Sivakumar Pudhur', location: 'Pudhur', notes: '' },
  { name: 'Kabilan Arakkonam', location: 'Arakkonam', notes: '' },
  { name: 'Senthil Tambaram', location: 'Tambaram', notes: '2,700 bricks on hold due to payment.', hold: true },
  { name: 'Rajagopal Thervai', location: 'Thervai', notes: '1,000 x 6" CIB on hold due to payment.', hold: true },
];

const ORDERS = [
  { k: 'ord-001', date: '2026-07-02', cust: 'Senthil Tambaram', prod: 'MIB-8', qty: 900, pay: 'Hold - Payment', notes: 'Part of a 3,500 brick 8" MIB commitment.' },
  { k: 'ord-002', date: '2026-07-05', cust: 'Senthil Tambaram', prod: 'MIB-8', qty: 900, pay: 'Hold - Payment', notes: '' },
  { k: 'ord-003', date: '2026-07-08', cust: 'Senthil Tambaram', prod: 'MIB-8', qty: 900, pay: 'Hold - Payment', notes: '' },
  { k: 'ord-004', date: '2026-07-20', cust: 'Jeevan Pattabiram', prod: 'MIB-8', qty: 5120, pay: 'Clear', notes: 'Largest open order. Advance 10,000 received 27/07. Scheduled 14/08-18/08.' },
  { k: 'ord-005', date: '2026-07-07', cust: 'Rajagopal Thervai', prod: 'CIB-6', qty: 1000, pay: 'Hold - Payment', notes: '' },
  { k: 'ord-006', date: '2026-06-29', cust: 'Umapathi Sriperumbudur', prod: 'MIB-8', qty: 450, pay: 'Clear', notes: '' },
  { k: 'ord-007', date: '2026-06-29', cust: 'Umapathi Sriperumbudur', prod: 'CIB-6', qty: 300, pay: 'Clear', notes: '1,000 x 6" CIB delivered 04/08 exceeds this order - check whether a larger order was never written down.' },
  { k: 'ord-008', date: '2026-06-28', cust: 'Yuvaraj Sampath Construction', prod: 'MIB-8', qty: 2000, pay: 'Clear', notes: '' },
  { k: 'ord-009', date: '2026-07-09', cust: 'Josep Ponneri', prod: 'MIB-8', qty: 2950, pay: 'Clear', notes: 'Sheet records this as mixed 8" MIB + 6" MIB with no split. Booked here as 8" MIB - split it once the mix is confirmed.' },
  { k: 'ord-010', date: '2026-07-07', cust: 'Padmanabhan (Kishore) Redhills', prod: 'MIB-8', qty: 2800, pay: 'Clear', notes: 'Scheduled 09/08-11/08.' },
  { k: 'ord-011', date: '2026-07-07', cust: 'Padmanabhan (Kishore) Redhills', prod: 'MIB-6', qty: 1100, pay: 'Clear', notes: '' },
  { k: 'ord-012', date: '2026-07-09', cust: 'Siva Thamaraipakkam', prod: 'MIB-8', qty: 600, pay: 'Clear', notes: 'Order book says delivered 13/07, daily sheet says 11/07 - dispatch record uses 11/07.' },
];

// One row per date + product. dr defaults 'None', fl defaults 'OK'.
const PROD_LOG = [
  { d: '2026-07-02', pr: 'MIB-8', q: 336, cm: 8 },
  { d: '2026-07-03', pr: 'MIB-8', q: 913, cm: 22 },
  { d: '2026-07-04', pr: 'MIB-8', q: 650, cm: 15 },
  { d: '2026-07-06', pr: 'MIB-8', q: 1141, cm: 27 },
  { d: '2026-07-07', pr: 'MIB-8', q: 1001, cm: 23 },
  { d: '2026-07-08', pr: 'CIB-8', q: 816, cm: 19 },
  { d: '2026-07-09', pr: 'CIB-8', q: 882, cm: 21 },
  { d: '2026-07-10', pr: 'MIB-8', q: 597, cm: 13 },
  { d: '2026-07-15', pr: 'CIB-6', q: 1618, cm: 30 },
  { d: '2026-07-16', pr: 'CIB-6', q: 821, cm: 16 },
  { d: '2026-07-17', pr: 'CIB-6', q: 1461, cm: 29 },
  { d: '2026-07-18', pr: 'CIB-6', q: 1262, cm: 24, rm: 'Delivery postponed this day due to insufficient stock.' },
  { d: '2026-07-19', pr: 'CIB-6', q: 270, cm: 6 },
  { d: '2026-07-20', pr: 'CIB-6', q: 1060, cm: 19.5 },
  { d: '2026-07-21', pr: 'CIB-6', q: 530, cm: 10, dr: 'Power Cut', rm: 'Power shutdown.' },
  { d: '2026-07-22', pr: 'CIB-6', q: 680, cm: 13 },
  { d: '2026-07-23', pr: 'CIB-6', q: 838, cm: 16 },
  { d: '2026-07-24', pr: 'CIB-6', q: 699, cm: 13, dr: 'Dye / Profile Change', rm: '8" MIB dye changing work.' },
  { d: '2026-07-25', pr: 'CIB-6', q: 542, cm: 10 },
  { d: '2026-07-26', pr: 'CIB-6', q: 0, cm: 0, dr: 'Labour Shortage', rm: 'No production - labourers were tired (Ramjan).' },
  { d: '2026-07-27', pr: 'CIB-6', q: 590, cm: 11 },
  { d: '2026-07-28', pr: 'CIB-6', q: 0, cm: 0, dr: 'Machine Breakdown', rm: 'No production - machine feeder seal damaged.' },
  { d: '2026-07-29', pr: 'CIB-6', q: 0, cm: 0, dr: 'Machine Breakdown', rm: 'No production - machine feeder seal damaged.' },
  { d: '2026-07-30', pr: 'CIB-6', q: 199, cm: 4 },
  { d: '2026-07-31', pr: 'CIB-6', q: 815, cm: 16 },
  { d: '2026-08-01', pr: 'MIB-8', q: 485, cm: 12 },
  { d: '2026-08-02', pr: 'MIB-8', q: 504, cm: 11 },
  { d: '2026-08-03', pr: 'MIB-8', q: 581, cm: 0, dr: 'Power Cut', rm: 'Night power cut. Cement bags not recorded for this day.' },
  { d: '2026-08-04', pr: 'MIB-8', q: 300, cm: 6.7, fl: 'Estimated', rm: 'Red soil not available so 8" CIB was made instead. Day total 14 cement bags split proportionally.' },
  { d: '2026-08-04', pr: 'CIB-8', q: 329, cm: 7.3, fl: 'Estimated', rm: 'Day total 14 cement bags split proportionally between MIB-8 and CIB-8.' },
  { d: '2026-08-05', pr: 'MIB-8', q: 401, cm: 9.0, fl: 'Estimated', rm: 'Day total 27 cement bags split proportionally between MIB-8 and CIB-8.' },
  { d: '2026-08-05', pr: 'CIB-8', q: 796, cm: 18.0, fl: 'Estimated', rm: 'Day total 27 cement bags split proportionally between MIB-8 and CIB-8.' },
  { d: '2026-08-06', pr: 'MIB-8', q: 600, cm: 0, dr: 'Power Cut', rm: 'Power cut 08:30 to 14:00. Cement bags not recorded.' },
  { d: '2026-08-07', pr: 'MIB-8', q: 258, cm: 0, fl: 'Check - sources disagree', rm: 'Labour reckoning block records 258; weekly plan records 1,192 for the same day. 258 used here - confirm which is right.' },
];

const PLAN = [
  { d: '2026-07-15', pr: 'CIB-6', pl: 1600, n: '6" brick production' },
  { d: '2026-07-16', pr: 'CIB-6', pl: 800, n: '6" brick production' },
  { d: '2026-07-17', pr: 'CIB-6', pl: 800, n: '6" brick production' },
  { d: '2026-07-18', pr: 'CIB-6', pl: 800, n: '6" brick production' },
  { d: '2026-07-19', pr: 'CIB-6', pl: 800, n: '6" brick production' },
  { d: '2026-07-20', pr: 'CIB-6', pl: 800, n: '6" brick production' },
  { d: '2026-07-21', pr: 'CIB-6', pl: 800, n: 'Power shutdown' },
  { d: '2026-07-22', pr: 'CIB-6', pl: 800, n: '6" brick production' },
  { d: '2026-07-23', pr: 'CIB-6', pl: 1400, n: '6" brick production' },
  { d: '2026-07-24', pr: 'CIB-6', pl: 0, n: '8" MIB dye changing work' },
  { d: '2026-07-25', pr: 'CIB-6', pl: 1400, n: '6" CIB production' },
  { d: '2026-07-26', pr: 'CIB-6', pl: 0, n: 'No production - labour' },
  { d: '2026-07-27', pr: 'CIB-6', pl: 1400, n: '6" CIB production' },
  { d: '2026-07-28', pr: 'CIB-6', pl: 1500, n: 'Machine feeder seal damaged' },
  { d: '2026-07-29', pr: 'CIB-6', pl: 1500, n: 'Machine feeder seal damaged' },
  { d: '2026-07-30', pr: 'CIB-6', pl: 1500, n: '6" CIB production' },
  { d: '2026-07-31', pr: 'CIB-6', pl: 1500, n: '6" CIB production' },
  { d: '2026-08-01', pr: 'MIB-8', pl: 800, n: '8" MIB production' },
  { d: '2026-08-02', pr: 'MIB-8', pl: 0, n: '8" MIB production' },
  { d: '2026-08-03', pr: 'MIB-8', pl: 1300, n: 'Night power cut' },
  { d: '2026-08-04', pr: 'MIB-8', pl: 1300, n: 'Red soil not available so 8" CIB made' },
  { d: '2026-08-05', pr: 'MIB-8', pl: 1300, n: '8" MIB production' },
  { d: '2026-08-06', pr: 'MIB-8', pl: 1300, n: 'Power cut 08:30 to 14:00' },
  { d: '2026-08-07', pr: 'MIB-8', pl: 1300, n: 'Weekly sheet claims 1,192 - unresolved' },
  { d: '2026-08-08', pr: 'MIB-8', pl: 1300, n: '8" MIB production' },
  { d: '2026-08-09', pr: 'MIB-8', pl: 1300, n: '8" MIB production' },
  { d: '2026-08-10', pr: 'MIB-8', pl: 1300, n: '8" MIB production' },
  { d: '2026-08-11', pr: 'MIB-8', pl: 1300, n: '8" MIB production' },
  { d: '2026-08-12', pr: 'CIB-6', pl: 1100, n: 'Profile changing 6" CIB' },
  { d: '2026-08-13', pr: 'CIB-6', pl: 2000, n: '6" CIB production' },
  { d: '2026-08-14', pr: 'CIB-6', pl: 2000, n: '6" CIB production' },
  { d: '2026-08-15', pr: 'CIB-6', pl: 2000, n: '6" CIB production' },
  { d: '2026-08-16', pr: 'CIB-6', pl: 2000, n: '6" CIB production' },
  { d: '2026-08-17', pr: 'MIB-8', pl: 0, n: 'Profile changing 8" MIB' },
  { d: '2026-08-18', pr: 'MIB-8', pl: 0, n: 'Profile changing 8" MIB' },
  { d: '2026-08-19', pr: 'MIB-8', pl: 0, n: 'Profile changing 8" MIB' },
  { d: '2026-08-20', pr: 'MIB-8', pl: 0, n: 'Profile changing 8" MIB' },
  { d: '2026-08-21', pr: 'MIB-8', pl: 0, n: 'Profile changing 8" MIB' },
];

const TRIPS = [
  { k: 'trip-001', d: '2026-07-31', v: '407 Eicher', s: 213003, e: 213094, l: 18.2, n: 'Arul - Kundrathur.' },
  { k: 'trip-002', d: '2026-08-01', v: '407 Eicher', s: 213094, e: 213135, l: 8.2, n: 'Yuvaraj - Moolakadai.' },
  { k: 'trip-003', d: '2026-08-04', v: '407 Eicher', s: 213135, e: 213256, l: 24.2, n: 'Umapathi - Sriperumbudur. Rs.2,000 fuel purchase recorded against 20.10 litres.' },
];

// st defaults 'Delivered', fl defaults 'OK'. or/tr reference seed keys above.
const DELIVERIES = [
  { d: '2026-07-03', cu: 'KL Associates', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-05', cu: 'KL Associates', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-08', cu: 'KL Associates', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-10', cu: 'Old Erumavettipalayam (Selvam)', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-11', cu: 'KL Associates', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-11', cu: 'Siva Thamaraipakkam', pr: 'MIB-8', q: 600, or: 'ord-012', fl: 'Check - sources disagree', n: 'Daily sheet says 11/07, order book says 13/07.' },
  { d: '2026-07-13', cu: 'Yuvaraj Sampath Construction', pr: 'MIB-8', q: 1000, or: 'ord-008' },
  { d: '2026-07-13', cu: 'Murali Perungavur', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-14', cu: 'KL Associates', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-15', cu: 'Old Erumavettipalayam (Selvam)', pr: 'CIB-6', q: 823 },
  { d: '2026-07-17', cu: 'Gopalakrishnan Kodambakkam', pr: 'MIB-8', q: 1000 },
  { d: '2026-07-19', cu: 'Old Erumavettipalayam (Selvam)', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-19', cu: 'Yuvaraj Sampath Construction', pr: 'MIB-8', q: 1000, or: 'ord-008' },
  { d: '2026-07-20', cu: 'KL Associates', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-20', cu: 'Yuvaraj Sampath Construction', pr: 'CIB-8', q: 1000 },
  { d: '2026-07-21', cu: 'Old Erumavettipalayam (Selvam)', pr: 'CIB-6', q: 1000, fl: 'Check - sources disagree', n: 'Daily sheet row shows both 1,000 x 6" CIB and 1,000 x 8" CIB against a stated total of 1,000.' },
  { d: '2026-07-21', cu: 'Old Erumavettipalayam (Selvam)', pr: 'CIB-8', q: 1000, fl: 'Check - sources disagree', n: 'Second half of the same ambiguous row - confirm whether 1,000 or 2,000 actually went out.' },
  { d: '2026-07-22', cu: 'KL Associates', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-22', cu: 'Old Erumavettipalayam (Selvam)', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-22', cu: 'KL Associates', pr: 'CIB-6', q: 1000, fl: 'Check - sources disagree', n: 'Third delivery logged against 22/07 - possible duplicate entry in the daily sheet.' },
  { d: '2026-07-24', cu: 'Yuvaraj Sampath Construction', pr: 'CIB-8', q: 1000 },
  { d: '2026-07-25', cu: 'Murali Perungavur', pr: 'MIB-6', q: 800, fl: 'Check - sources disagree', n: 'Daily sheet spells this "murali sirungavur".' },
  { d: '2026-07-26', cu: 'Old Erumavettipalayam (Selvam)', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-27', cu: 'Yuvaraj Sampath Construction', pr: 'MIB-8', q: 855, fl: 'Check - sources disagree', n: 'Total column says 855, product column says 1,000.' },
  { d: '2026-07-29', cu: 'Old Erumavettipalayam (Selvam)', pr: 'CIB-6', q: 1000 },
  { d: '2026-07-31', cu: 'Arul Kundrathur', pr: 'CIB-6', q: 1000, tr: 'trip-001' },
  { d: '2026-08-01', cu: 'Yuvaraj Sampath Construction', pr: 'CIB-8', q: 1000, tr: 'trip-002' },
  { d: '2026-08-04', cu: 'Umapathi Sriperumbudur', pr: 'CIB-6', q: 1000, or: 'ord-007', tr: 'trip-003', fl: 'Check - sources disagree', n: 'Order on file is only 300.' },
  { d: '2026-08-07', cu: 'Asif Periyapalayam', pr: 'MIB-8', q: 550 },
  { d: '2026-08-08', cu: 'Asif Periyapalayam', pr: 'MIB-6', q: 550, st: 'Planned' },
  { d: '2026-08-09', cu: 'Padmanabhan (Kishore) Redhills', pr: 'MIB-8', q: 1000, st: 'Planned', or: 'ord-010' },
  { d: '2026-08-10', cu: 'Padmanabhan (Kishore) Redhills', pr: 'MIB-8', q: 1000, st: 'Planned', or: 'ord-010' },
  { d: '2026-08-11', cu: 'Padmanabhan (Kishore) Redhills', pr: 'MIB-8', q: 1000, st: 'Planned', or: 'ord-010' },
  { d: '2026-08-14', cu: 'Jeevan Pattabiram', pr: 'MIB-8', q: 1000, st: 'Planned', or: 'ord-004' },
  { d: '2026-08-14', cu: 'Jeevan Pattabiram', pr: 'CIB-6', q: 300, st: 'Planned' },
  { d: '2026-08-15', cu: 'Jeevan Pattabiram', pr: 'MIB-8', q: 1000, st: 'Planned', or: 'ord-004' },
  { d: '2026-08-16', cu: 'Jeevan Pattabiram', pr: 'MIB-8', q: 1000, st: 'Planned', or: 'ord-004' },
  { d: '2026-08-17', cu: 'Jeevan Pattabiram', pr: 'MIB-8', q: 1050, st: 'Planned', or: 'ord-004', n: 'Advance 10,000 received 27/07.' },
  { d: '2026-08-18', cu: 'Jeevan Pattabiram', pr: 'MIB-8', q: 1070, st: 'Planned', or: 'ord-004' },
  { d: '2026-08-18', cu: 'Arul Kundrathur', pr: 'CIB-6', q: 1200, st: 'Planned' },
  { d: '2026-08-19', cu: 'Senthil Tambaram', pr: 'MIB-6', q: 200, st: 'Planned', n: 'CREDIT HOLD - do not dispatch until payment clears.' },
  { d: '2026-08-19', cu: 'Senthil Tambaram', pr: 'MIB-8', q: 800, st: 'Planned', or: 'ord-001', n: 'CREDIT HOLD - do not dispatch until payment clears.' },
  { d: '2026-08-20', cu: 'Sivakumar Pudhur', pr: 'MIB-8', q: 1000, st: 'Planned', n: 'No order recorded in the order book.' },
  { d: '2026-08-21', cu: 'Sivakumar Pudhur', pr: 'MIB-8', q: 1000, st: 'Planned' },
  { d: '2026-08-22', cu: 'Sivakumar Pudhur', pr: 'MIB-8', q: 1000, st: 'Planned' },
  { d: '2026-08-23', cu: 'Josep Ponneri', pr: 'MIB-8', q: 2950, st: 'Planned', or: 'ord-009', n: 'Order is mixed 8"/6" MIB - split before dispatch.' },
  { d: '2026-08-24', cu: 'Umapathi Sriperumbudur', pr: 'CIB-6', q: 1000, st: 'Planned' },
  { d: '2026-08-25', cu: 'Kabilan Arakkonam', pr: 'MIB-8', q: 0, st: 'Planned', fl: 'Qty to confirm', n: 'Weekly plan lists the customer with no product or quantity.' },
  { d: '2026-08-26', cu: 'Arul Kundrathur', pr: 'MIB-8', q: 0, st: 'Planned', fl: 'Qty to confirm', n: 'Weekly plan lists the customer with no product or quantity.' },
];

// Advances carry a negative rate so amount = qty × rate holds for every row.
const LABOUR = [
  { d: '2026-07-25', wk: 'Production team', ty: 'Loading', q: 9800, r: 3, n: '10 loads, week 19/07-25/07.' },
  { d: '2026-07-25', wk: 'Production team', ty: 'Production 6"', q: 4726, r: 6, n: 'Week 19/07-25/07.' },
  { d: '2026-07-25', wk: 'Production team', ty: 'Advance', q: 1, r: -3500, n: 'Salary advance.' },
  { d: '2026-07-25', wk: 'Ramjan', ty: 'Advance', q: 1, r: -1000, n: 'Advance. Week net paid: 53,256.' },
  { d: '2026-08-01', wk: 'Production team', ty: 'Loading', q: 4855, r: 3, n: '5 loads, week 26/07-01/08.' },
  { d: '2026-08-01', wk: 'Production team', ty: 'Production 6"', q: 1604, r: 6, n: 'Week 26/07-01/08.' },
  { d: '2026-08-01', wk: 'Production team', ty: 'Production 8"', q: 485, r: 7, n: 'Week 26/07-01/08.' },
  { d: '2026-08-01', wk: 'Production team', ty: 'Advance', q: 1, r: -5000, n: 'Salary advance.' },
  { d: '2026-08-01', wk: 'Ramjan', ty: 'Advance', q: 1, r: -1000, n: 'Advance. Week net paid: 21,584.' },
  { d: '2026-08-08', wk: 'Production team', ty: 'Loading', q: 2550, r: 3, n: '3 loads, week 02/08-08/08.' },
  { d: '2026-08-08', wk: 'Production team', ty: 'Production 8"', q: 3769, r: 7, n: 'Week 02/08-08/08.' },
  { d: '2026-08-08', wk: 'Santu', ty: 'Advance', q: 1, r: -6000, n: 'Salary advance. Running advance balance 14,000.' },
  { d: '2026-08-08', wk: 'Ramjan', ty: 'Advance', q: 1, r: -1000, n: 'Advance. Running balance 10,000. Week net paid: 27,033.' },
  { d: '2026-08-03', wk: 'Jerman Shke', ty: 'NMR Daily', q: 1, r: 1000, n: 'Pan mixer concrete work.' },
  { d: '2026-08-03', wk: 'Rohith', ty: 'NMR Daily', q: 1, r: 800, n: 'Electrical pipe binding work.' },
  { d: '2026-08-04', wk: 'Jerman Shke', ty: 'NMR Daily', q: 1, r: 1000, n: 'Pan mixer concrete work.' },
  { d: '2026-08-04', wk: 'Rohith', ty: 'NMR Daily', q: 1, r: 800, n: 'Electrical pipe binding work.' },
  { d: '2026-08-05', wk: 'Jerman Shke', ty: 'NMR Daily', q: 1, r: 1000, n: 'Bathroom pointing work.' },
  { d: '2026-08-05', wk: 'Rohith', ty: 'NMR Daily', q: 1, r: 800, n: 'Filth beam work.' },
  { d: '2026-08-06', wk: 'Samurul', ty: 'NMR Daily', q: 1, r: 600, n: 'Painting work.' },
  { d: '2026-08-07', wk: 'Ramzan', ty: 'NMR Daily', q: 1, r: 800, n: 'Plate fixing and cutting work.' },
];

const ASSETS = [
  ['Interlock brick machine', 'Machinery', 1, 'Plant', 'Quantity not stated in the sheet - assumed 1.'],
  ['Hydraulic power pack', 'Machinery', 1, 'Plant', 'Quantity not stated in the sheet - assumed 1.'],
  ['Pan mixer small (5HP motor)', 'Machinery', 1, 'Plant', 'Quantity not stated in the sheet - assumed 1.'],
  ['Pan mixer big (7.5HP motor)', 'Machinery', 1, 'Plant', 'Quantity not stated in the sheet - assumed 1.'],
  ['Weighing machine 50-100 kg', 'Machinery', 2, 'Plant', ''],
  ['14" cutting machine', 'Machinery', 1, 'RTO', ''],
  ['AG4 cutting machine', 'Machinery', 1, 'RTO', ''],
  ['Generator', 'Machinery', 1, 'Plant', ''],
  ['Sensor', 'Machinery', 7, 'Plant', ''],
  ['Machine handle', 'Machinery Tools', 1, 'Plant', ''],
  ['Bricks dye', 'Machinery Tools', 1, 'Plant', ''],
  ['Dyes 6"', 'Machinery Tools', 2, 'Plant', ''],
  ['Solid block dye', 'Machinery Tools', 1, 'Plant', ''],
  ['Dyes 8"', 'Machinery Tools', 2, 'Plant', '1 of these is new.'],
  ['Spanner set (21/23, 14/15, 18/19, 7/16, 5/16, 16/17)', 'Mechanical Tools', 1, 'Plant', '1 each.'],
  ['Allen key box', 'Mechanical Tools', 1, 'Plant', ''],
  ['Grease gun', 'Mechanical Tools', 1, 'Plant', ''],
  ['10mm spanner', 'Mechanical Tools', 2, 'Plant', ''],
  ['Circlip plier', 'Mechanical Tools', 1, 'Plant', ''],
  ['Welding rods', 'Mechanical Tools', 50, 'Plant', ''],
  ['Tool box - wrench bits', 'Mechanical Tools', 1, 'Plant', ''],
  ['407 Eicher', 'Vehicles', 1, 'Plant', ''],
  ['439 RDX tractor', 'Vehicles', 1, 'Plant', ''],
  ['Tricycle big', 'Vehicles', 1, 'Plant', ''],
  ['Two wheel trolley small', 'Vehicles', 1, 'Plant', ''],
  ['Four wheel trolley big', 'Vehicles', 1, 'Plant', ''],
  ['Spade (manvetti)', 'Construction Tools', 7, 'Plant', ''],
  ['Hoe', 'Construction Tools', 3, 'Plant', ''],
  ['Bond big', 'Construction Tools', 2, 'Plant', ''],
  ['Bond small', 'Construction Tools', 4, 'Plant', ''],
  ['Plastic bond', 'Construction Tools', 3, 'Split - see notes', 'Plant 3, RTO 5, VM 4.'],
  ['Centring hammer', 'Construction Tools', 3, 'Split - see notes', 'Plant 3, VM 2.'],
  ['Hammer', 'Construction Tools', 2, 'Split - see notes', 'Plant 2, VM 1.'],
  ['Screed board', 'Construction Tools', 1, 'Plant', ''],
  ['Ghuthirai', 'Construction Tools', 4, 'VM', ''],
  ['Water tank (1000 ltr)', 'Construction Tools', 8, 'Split - see notes', 'Plant 8, RTO 3, VM 1.'],
  ['Barrel (200 ltr)', 'Construction Tools', 9, 'Split - see notes', 'Plant 9, RTO 6.'],
  ['Hook', 'Construction Tools', 4, 'Split - see notes', 'RTO and VM 2.'],
  ['Tube level', 'Construction Tools', 2, 'Split - see notes', 'RTO 1, VM 1.'],
  ['12mm lever', 'Construction Tools', 12, 'Split - see notes', 'RTO 1, VM 1.'],
  ['8mm lever', 'Construction Tools', 0, 'Unknown', 'Listed in the sheet with no quantity.'],
  ['16mm lever', 'Construction Tools', 1, 'RTO', ''],
  ['Spirit level', 'Construction Tools', 1, 'Plant', ''],
  ['Tape 50m', 'Construction Tools', 1, 'Plant', ''],
  ['Plastic bucket', 'Construction Tools', 9, 'Plant', ''],
  ['HDPE drum', 'Construction Tools', 5, 'Plant', ''],
  ['Axe big', 'Construction Tools', 2, 'Plant', ''],
  ['Axe small', 'Construction Tools', 1, 'Plant', ''],
  ['Crowbar', 'Construction Tools', 2, 'Plant', ''],
  ['Levelling wood 5ft / 3ft', 'Construction Tools', 2, 'Plant', '1 each.'],
  ['Metal bucket', 'Construction Tools', 1, 'Plant', ''],
  ['Sand shewar', 'Construction Tools', 2, 'Plant', ''],
  ['Junction box cable', 'Electrical & Electronic Tools', 1, 'Plant', ''],
  ['Tester', 'Electrical & Electronic Tools', 2, 'Plant', '1 is new.'],
  ['Sensor - new model', 'Electrical & Electronic Tools', 2, 'Plant', ''],
  ['Sensor - old model', 'Electrical & Electronic Tools', 7, 'Plant', ''],
  ['Hydraulic valve', 'Electrical & Electronic Tools', 1, 'Plant', ''],
];

// ------------------------------------------------------------------ seeding

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const pad3 = (n) => String(n + 1).padStart(3, '0');

async function main() {
  await client.connect();
  await client.query('BEGIN');
  const counts = {};

  // products
  let inserted = 0;
  for (const p of PRODUCTS) {
    const r = await client.query(
      `INSERT INTO factory_products (code, notes) VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [p.code, p.notes],
    );
    inserted += r.rowCount;
  }
  counts.products = inserted;
  const prodMap = {};
  for (const row of (await client.query('SELECT id, code FROM factory_products')).rows) {
    prodMap[row.code] = row.id;
  }

  // customers
  inserted = 0;
  for (const c of CUSTOMERS) {
    const r = await client.query(
      `INSERT INTO factory_customers (name, location, phone, credit_hold, notes)
       VALUES ($1, $2, NULL, $3, $4) ON CONFLICT (name) DO NOTHING`,
      [c.name, c.location || null, !!c.hold, c.notes],
    );
    inserted += r.rowCount;
  }
  counts.customers = inserted;
  const custMap = {};
  for (const row of (await client.query('SELECT id, name FROM factory_customers')).rows) {
    custMap[row.name] = row.id;
  }

  // orders
  inserted = 0;
  for (const o of ORDERS) {
    const r = await client.query(
      `INSERT INTO factory_orders
        (customer_id, order_date, product_id, qty_ordered, payment_status, seed_key, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (seed_key) DO NOTHING`,
      [custMap[o.cust], o.date, prodMap[o.prod], o.qty, o.pay, o.k, o.notes || null],
    );
    inserted += r.rowCount;
  }
  counts.orders = inserted;
  const orderMap = {};
  for (const row of (
    await client.query('SELECT id, seed_key FROM factory_orders WHERE seed_key IS NOT NULL')
  ).rows) {
    orderMap[row.seed_key] = row.id;
  }

  // trips
  inserted = 0;
  for (const t of TRIPS) {
    const r = await client.query(
      `INSERT INTO factory_trips
        (trip_date, vehicle, start_km, end_km, diesel_litres, seed_key, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (seed_key) DO NOTHING`,
      [t.d, t.v, t.s, t.e, t.l, t.k, t.n || null],
    );
    inserted += r.rowCount;
  }
  counts.trips = inserted;
  const tripMap = {};
  for (const row of (
    await client.query('SELECT id, seed_key FROM factory_trips WHERE seed_key IS NOT NULL')
  ).rows) {
    tripMap[row.seed_key] = row.id;
  }

  // production log
  inserted = 0;
  for (const p of PROD_LOG) {
    const r = await client.query(
      `INSERT INTO factory_production_log
        (log_date, product_id, qty_produced, cement_bags, downtime_reason, remarks, data_flag)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (log_date, product_id) DO NOTHING`,
      [p.d, prodMap[p.pr], p.q, p.cm ?? null, p.dr ?? 'None', p.rm ?? null, p.fl ?? 'OK'],
    );
    inserted += r.rowCount;
  }
  counts.production_log = inserted;

  // production plan
  inserted = 0;
  for (const p of PLAN) {
    const r = await client.query(
      `INSERT INTO factory_production_plan (plan_date, product_id, planned_qty, plan_note)
       VALUES ($1, $2, $3, $4) ON CONFLICT (plan_date, product_id) DO NOTHING`,
      [p.d, prodMap[p.pr], p.pl, p.n || null],
    );
    inserted += r.rowCount;
  }
  counts.production_plan = inserted;

  // deliveries
  inserted = 0;
  for (let i = 0; i < DELIVERIES.length; i++) {
    const d = DELIVERIES[i];
    const r = await client.query(
      `INSERT INTO factory_deliveries
        (delivery_date, customer_id, product_id, qty, status, order_id, trip_id,
         data_flag, seed_key, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (seed_key) DO NOTHING`,
      [
        d.d, custMap[d.cu], prodMap[d.pr], d.q, d.st ?? 'Delivered',
        d.or ? orderMap[d.or] : null, d.tr ? tripMap[d.tr] : null,
        d.fl ?? 'OK', `del-${pad3(i)}`, d.n ?? null,
      ],
    );
    inserted += r.rowCount;
  }
  counts.deliveries = inserted;

  // labour
  inserted = 0;
  for (let i = 0; i < LABOUR.length; i++) {
    const l = LABOUR[i];
    const r = await client.query(
      `INSERT INTO factory_labour (work_date, worker, work_type, qty, rate, seed_key, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (seed_key) DO NOTHING`,
      [l.d, l.wk, l.ty, l.q, l.r, `lab-${pad3(i)}`, l.n || null],
    );
    inserted += r.rowCount;
  }
  counts.labour = inserted;

  // assets
  inserted = 0;
  for (const [asset, category, qty, location, notes] of ASSETS) {
    const r = await client.query(
      `INSERT INTO factory_assets (asset, category, qty, location, notes)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (asset, location) DO NOTHING`,
      [asset, category, qty, location, notes || null],
    );
    inserted += r.rowCount;
  }
  counts.assets = inserted;

  await client.query('COMMIT');
  console.log('inserted (0 = already seeded):', JSON.stringify(counts, null, 1));

  const { rows: stock } = await client.query(
    'SELECT code, produced, delivered, committed, stock_balance, free_stock, bricks_per_bag FROM factory_stock_v ORDER BY code',
  );
  console.log('\nfactory_stock_v:');
  for (const s of stock) {
    console.log(
      ` ${s.code}: produced=${s.produced} delivered=${s.delivered} committed=${s.committed}` +
        ` balance=${s.stock_balance} free=${s.free_stock} bricks/bag=${s.bricks_per_bag}`,
    );
  }
  const { rows: orders } = await client.query(
    "SELECT customer_name, qty_ordered, delivered, balance_due, fulfilment FROM factory_orders_v ORDER BY order_date",
  );
  console.log('\nfactory_orders_v:');
  for (const o of orders) {
    console.log(
      ` ${o.customer_name}: ordered=${o.qty_ordered} delivered=${o.delivered}` +
        ` balance=${o.balance_due} (${o.fulfilment})`,
    );
  }
}

main()
  .catch(async (e) => {
    await client.query('ROLLBACK').catch(() => {});
    console.error('SEED FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
