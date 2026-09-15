import lighthouse from 'lighthouse';
import {launch} from 'chrome-launcher';
import {chromium} from 'playwright';
import fs from 'node:fs';
const url='https://alafandichicken.com';
const summaries=[];
fs.mkdirSync('audit-results',{recursive:true});
for(const mode of ['mobile-first-visit','mobile-menu-1','mobile-menu-2','mobile-menu-3','desktop-menu']){
 const chrome=await launch({chromeFlags:['--headless=new','--no-sandbox','--disable-dev-shm-usage']});
 try{
  const desktop=mode.startsWith('desktop');
  if(mode!=='mobile-first-visit'){
   const browser=await chromium.connectOverCDP(`http://localhost:${chrome.port}`);
   const context=browser.contexts()[0];
   const page=await context.newPage();
   await page.route('**/_vercel/**',r=>r.abort());
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.evaluate(()=>{localStorage.setItem('affandi-lang-v2','en');localStorage.setItem('affandi-language-seen-v2','1');sessionStorage.clear()});
   await page.close();
  }
  const settings={port:chrome.port,logLevel:'error',output:['json','html'],onlyCategories:['performance','accessibility','best-practices','seo'],disableStorageReset:mode!=='mobile-first-visit',blockedUrlPatterns:['*/_vercel/*','*wa.me/*']};
  if(desktop)Object.assign(settings,{formFactor:'desktop',screenEmulation:{mobile:false,width:1440,height:900,deviceScaleFactor:1,disabled:false},throttling:{rttMs:40,throughputKbps:10240,cpuSlowdownMultiplier:1,requestLatencyMs:0,downloadThroughputKbps:0,uploadThroughputKbps:0}});
  const result=await lighthouse(url,settings);
  const lhr=result.lhr;
  fs.writeFileSync(`audit-results/lighthouse-${mode}.json`,result.report[0]);
  fs.writeFileSync(`audit-results/lighthouse-${mode}.html`,result.report[1]);
  const metric=id=>({value:lhr.audits[id]?.numericValue,display:lhr.audits[id]?.displayValue});
  summaries.push({mode,url:lhr.finalDisplayedUrl,fetchTime:lhr.fetchTime,version:lhr.lighthouseVersion,scores:Object.fromEntries(Object.entries(lhr.categories).map(([id,c])=>[id,Math.round(c.score*100)])),metrics:{fcp:metric('first-contentful-paint'),lcp:metric('largest-contentful-paint'),tbt:metric('total-blocking-time'),cls:metric('cumulative-layout-shift'),speedIndex:metric('speed-index')},failedAudits:Object.values(lhr.audits).filter(a=>a.score!==null&&a.score<1).map(a=>({id:a.id,title:a.title,score:a.score,display:a.displayValue,details:a.details})),warnings:lhr.runWarnings,runtimeError:lhr.runtimeError});
 }catch(error){summaries.push({mode,error:error.stack})}finally{await chrome.kill()}
}
fs.writeFileSync('audit-results/lighthouse-summary.json',JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries.map(({failedAudits,...s})=>s),null,2));
if(summaries.some(s=>s.error||s.runtimeError))process.exit(1);
