'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),vm=require('vm');
const root=path.join(__dirname,'../src');
const fakeRow=(date,values)=>({weekEnding:date,values});
const cases=[
 fakeRow('2026-07-10',{G:0,H:5,B:12,C:8,M:20}),
 fakeRow('2026-07-17',{G:7,H:null,B:14,C:10,M:22}),
 fakeRow('2026-07-24',{G:10,H:9,B:17,C:12,M:25}),
 fakeRow('2026-10-16',{G:15,H:12,B:21,C:11,M:32})
];
const app={innerHTML:''},elems={app};let stubAPI={getWeeklyChartHistory:async()=>({connected:true,rows:cases})};
const document={getElementById(id){return elems[id]||null},querySelector(){return null}};
let lastHeader='',page='';
const ux={setHeader(s){lastHeader=s},set page(x){page=x},get page(){return page}};
const window={clinicAPI:stubAPI,UX:ux,renderWeeklyReportWeeks(){window.navigated=true;}};
const ctx={document,window,console,Date,Object,Number,String,Promise};
vm.runInNewContext(fs.readFileSync(path.join(root,'weekly-charts.js'),'utf8'),ctx);
async function tick(){await Promise.resolve();await new Promise(done=>setImmediate(done));}
(async()=>{
 await window.renderWeeklyDashboard();await tick();
 assert.equal(lastHeader,'Weekly Report Dashboard');
 assert.match(app.innerHTML,/This Week/);assert.match(app.innerHTML,/Ahead/);
 assert.match(app.innerHTML,/wd-weekly/);assert.match(app.innerHTML,/wd-ahead/);
 assert.match(app.innerHTML,/<svg/);assert.match(app.innerHTML,/Ocular Motor Exams/);
 assert.match(app.innerHTML,/Oct 16, 2026/);assert.match(app.innerHTML,/View chart data/);
 assert.match(app.innerHTML,/Total for selected period/);
 assert.match(app.innerHTML,/Total of weekly projections/);
 assert.match(app.innerHTML,/data-wd-index="0"/);
 assert.match(app.innerHTML,/data-wd-tooltip/);
 assert.match(app.innerHTML,/Hover over a date or click/);
 assert.match(app.innerHTML,/Sum of 4 reported weeks/);
 assert.match(app.innerHTML,/Sum of 4 reported weeks<\/div>/);
 assert.match(app.innerHTML,/<div class="wd-stat-value">32<\/div>/); // 0+7+10+15
 assert.match(app.innerHTML,/<div class="wd-stat-value">64<\/div>/); // 12+14+17+21 (Ahead)
 const helpers=window.weeklyChartHelpers;
 assert.equal(helpers.totalForMetric(cases,{id:'G'}).total,32);
 assert.equal(helpers.totalForMetric(cases,{id:'H'}).total,26); // ignores missing week
 assert.equal(helpers.totalForMetric(cases,{id:'H'}).count,3);
 assert.equal(helpers.totalForMetric(cases,{id:'X'}).total,null);
 assert.equal(helpers.totalForMetric([cases[0]],{id:'G'}).total,0);
 const tip=helpers.pointTooltipMarkup('weekly',cases[2],[{id:'G',name:'Ocular Motor Exams'},{id:'H',name:'Perception Tests'}]);
 assert.match(tip,/Jul 24, 2026/);
 assert.match(tip,/Ocular Motor Exams/);assert.match(tip,/Perception Tests/);
 assert.match(tip,/wd-tip-entry/);
 assert.match(tip,/>10<\/strong>/);assert.match(tip,/>9<\/strong>/);
 const missingTip=helpers.pointTooltipMarkup('weekly',cases[1],[{id:'H',name:'Perception Tests'}]);
 assert.match(missingTip,/Not recorded/);

 assert.equal(window.weeklyChartHelpers.safeValue(0),0);
 assert.equal(window.weeklyChartHelpers.safeValue(null),null);
 assert.equal(window.weeklyChartHelpers.safeValue(-2),null);
 const rows=cases;
 const range=window.weeklyChartHelpers.startOfRange('weekly',rows,{range:'3m',selected:['G'],start:'',end:''});
 assert.equal(range,'2026-07-16');
 const custom=window.weeklyChartHelpers.startOfRange('ahead',rows,{range:'custom',selected:['B'],start:'2026-07-11',end:'2026-08-01'});
 assert.equal(custom,'2026-07-11');
 window.renderWeeklyReportWeeks=()=>{window.navigated=true;};
 // Reading source book failing must not show fabricated graphs.
 stubAPI.getWeeklyChartHistory=async()=>{throw new Error('Workbook locked')};
 window.clinicAPI=stubAPI;
 await window.renderWeeklyDashboard();await tick();
 assert.match(app.innerHTML,/Workbook locked/);
 assert.doesNotMatch(app.innerHTML,/<svg/);

 // Test Patients Scheduled buckets (by day, week, month) and Monthly Report chart on the unified Dashboard.
 const setupSample=[
  {patientName:'A',scheduledOn:'2026-10-10'},
  {patientName:'B',scheduledOn:'2026-10-10'},
  {patientName:'C',scheduledOn:'2026-10-12'},
  {patientName:'D',initialContactDate:'2026-11-05'}
 ];
 const byDay=helpers.buildScheduledBuckets(setupSample,{unit:'day',range:'custom',start:'2026-10-10',end:'2026-10-12'});
 assert.equal(byDay.length,3);
 assert.deepEqual(Array.from(byDay,b=>b.values.S),[2,0,1]);
 const byWeek=helpers.buildScheduledBuckets(setupSample,{unit:'week',range:'custom',start:'2026-10-01',end:'2026-11-10'});
 assert.ok(byWeek.length>=6);
 assert.equal(byWeek.reduce((s,b)=>s+b.values.S,0),4);
 const byMonth=helpers.buildScheduledBuckets(setupSample,{unit:'month',range:'custom',start:'2026-10-01',end:'2026-11-30'});
 assert.equal(byMonth.length,2);
 assert.deepEqual(Array.from(byMonth,b=>b.values.S),[3,1]);

 stubAPI={
  getWeeklyChartHistory:async()=>({connected:true,rows:cases}),
  listMonthlyReports:async()=>({months:[{month:'2026-09',inExcel:true,values:{D:24,I:180}},{month:'2026-10',inExcel:true,values:{D:31,I:210}}]}),
  listSetup:async()=>({records:setupSample})
 };
 window.clinicAPI=stubAPI;
 await window.renderWeeklyDashboard();await tick();
 assert.match(app.innerHTML,/wd-scheduled/);
 assert.match(app.innerHTML,/Patients Scheduled/);
 assert.match(app.innerHTML,/wd-monthly/);
 assert.match(app.innerHTML,/OM Exams Done/);

 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/data-nav="reports"/);
 assert.match(html,/id="reportsSubNav"/);
 assert.match(html,/data-report-nav="weekly-dashboard"/);
 assert.match(html,/data-report-nav="weekly-weeks"/);
 assert.match(html,/data-report-nav="monthly"/);

 console.log('Interactive dates, multi-series tooltips, period totals, both sections, missing-value rules and workbook errors: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
