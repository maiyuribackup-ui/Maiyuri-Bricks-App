#!/usr/bin/env node
/**
 * How far past its content box does each quotation page run, before and after
 * the template's fit routine tightens anything?
 *
 *   node scripts/measure-quotation.mjs <built quotation.html>
 *
 * Run this after editing apps/web/src/lib/quotation-html/template.html. Each
 * page is a fixed 297mm with `overflow: hidden`, so a page that has grown too
 * tall does not look broken — it quietly drops whatever sits at the bottom,
 * which is the advance block, the standing terms and the footer. Nothing else
 * in the build catches that.
 *
 * `natural_mm` is the page before the fit routine runs, `final_mm` after. A
 * final_mm above 0 means content is being clipped and wants a real edit, not
 * another dense rule.
 *
 * Measure the way the template measures: by the bottom of the last in-flow
 * child, not by scrollHeight. The watermarks are positioned to bleed off the
 * page edges, and scrollHeight counts a deliberate bleed as overflow — it
 * reported a page as 14mm over while its content ended well short of the
 * margin, and a fit routine trusting it shrank a page that had room spare.
 */
import puppeteer from "puppeteer-core";
import { pathToFileURL } from "node:url";

const b = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const p = await b.newPage();
await p.goto(pathToFileURL(process.argv[2]).href, { waitUntil: "load" });
const rows = await p.evaluate(() => {
  const mm = (v) => +(v / (96 / 25.4)).toFixed(1);
  const over = (page) => {
    const pad = parseFloat(getComputedStyle(page).paddingBottom) || 0;
    const limit = page.getBoundingClientRect().bottom - pad;
    let lowest = 0;
    for (const el of page.children) {
      if (getComputedStyle(el).position !== "static") continue;
      lowest = Math.max(lowest, el.getBoundingClientRect().bottom);
    }
    return lowest - limit;
  };
  return [...document.querySelectorAll(".page")].map((el, i) => {
    const applied = [...el.classList].filter((c) => c.startsWith("dense"));
    el.classList.remove("dense", "dense-2");
    const natural = mm(over(el));
    applied.forEach((c) => el.classList.add(c));
    return {
      page: i + 1,
      natural_mm: natural,
      slack_mm: natural < 0 ? -natural : 0,
      applied: applied.join(",") || "none",
      final_mm: mm(over(el)),
    };
  });
});
console.table(rows);
await b.close();
