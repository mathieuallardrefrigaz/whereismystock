#!/usr/bin/env node
/**
 * Detecte les doublons potentiels dans ORDERS avant publication du dashboard.
 * Usage : node scripts/check-duplicates.js
 *
 * Regle : deux cartes DIFFERENTES qui partagent le meme BC (po) + le meme SKU
 * ET la meme quantite sont tres probablement un doublon (meme item compte deux
 * fois sous deux formes : ex. carte "Expedie" + carte "Reste" pour le meme lot).
 * Un ecart de quantite entre deux cartes du meme SKU/BC est normal (expedition
 * partielle : shipped + reste = total commande) et n'est PAS signale comme erreur.
 * Exit code 1 si un doublon suspect est trouve (bloque la publication).
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "index.html");
const src = fs.readFileSync(file, "utf8");
const code = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n") + "\nglobal.__ORDERS = ORDERS; global.__SUPPLIERS = SUPPLIERS;";

function el(){ return { textContent:"", innerHTML:"", appendChild(){}, addEventListener(){}, classList:{add(){},remove(){},toggle(){}}, style:{}, setAttribute(){}, querySelectorAll:()=>[], querySelector:()=>null, dataset:{} }; }
global.document = { getElementById: () => el(), querySelectorAll: () => [], querySelector: () => null, createElement: () => el(), addEventListener: () => {} };
global.window = { addEventListener(){}, location:{search:""} };
global.navigator = {};
eval(code);
const ORDERS = global.__ORDERS;

const bySku = {};
ORDERS.forEach((o, idx) => {
  const pos = String(o.po).split("/").map(s => s.trim());
  pos.forEach(po => {
    (o.items || []).forEach(it => {
      if (it.sku === "—" || it.sku === "-" || !it.sku) return; // SKU generique, non fiable pour la dedup
      const key = po + "||" + it.sku;
      if (!bySku[key]) bySku[key] = [];
      bySku[key].push({ idx, po, qty: it.qty, shipDate: o.shipDate, tagline: o.tagline || "" });
    });
  });
});

let suspects = [];
Object.entries(bySku).forEach(([key, arr]) => {
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i].idx !== arr[j].idx && arr[i].qty === arr[j].qty) {
        suspects.push({ key, a: arr[i], b: arr[j] });
      }
    }
  }
});

if (suspects.length === 0) {
  console.log("OK — aucun doublon SKU+BC+quantite detecte sur", ORDERS.length, "cartes.");
  process.exit(0);
} else {
  console.log("DOUBLONS SUSPECTS DETECTES (memes BC+SKU+quantite sur 2 cartes distinctes) :");
  suspects.forEach(s => {
    console.log("  " + s.key + " qty=" + s.a.qty);
    console.log("    carte #" + s.a.idx + " : " + s.a.tagline);
    console.log("    carte #" + s.b.idx + " : " + s.b.tagline);
  });
  console.log("\nNe PAS publier tant que ces doublons ne sont pas resolus (fusionner ou confirmer qu'il s'agit bien de 2 lots distincts).");
  process.exit(1);
}
