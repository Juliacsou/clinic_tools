#!/usr/bin/env node
'use strict';
// Runs without installing dependencies. Detects missing files, corrupt batch
// paths, broken local imports, malformed JS and packaging manifest mistakes.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const READABLE = new Set(['.js','.json','.html','.css','.bat','.ps1','.txt','.md']);
const EXCLUDED = new Set(['node_modules','dist','diagnostico_npm','.git','release','out']);

function allFiles(root) {
  const found=[];
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    if (EXCLUDED.has(entry.name)) continue;
    const loc=path.join(root,entry.name);
    if (entry.isDirectory()) found.push(...allFiles(loc));
    else if (entry.isFile()) found.push(loc);
  }
  return found;
}
function forbiddenControls(bytes, forbidTabs=false) {
  const pos=[];
  for(let i=0;i<bytes.length;i++) {
    const n=bytes[i];
    if(n===127 || (n<32 && n!==10 && n!==13 && (n!==9||forbidTabs))) pos.push(i);
  }
  return pos;
}
function localFile(from, relative) {
  const target=path.resolve(path.dirname(from), relative);
  return [target,target+'.js',target+'.json',path.join(target,'index.js')].some(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
}
function auditProject(root=ROOT) {
  const errors=[],warnings=[],files=allFiles(root),has=relative=>fs.existsSync(path.join(root,relative));
  let pkg;
  try {pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));}
  catch(e){return {errors:['package.json: '+e.message],warnings,checked:0};}
  for(const rel of ['BUILD_WINDOWS.bat','VALIDAR_SEM_BUILD.bat','scripts/audit-gate.js','scripts/preflight.js',
                    'src/main.js','src/preload.js','src/index.html','src/monthly-excel.js',
                    'src/monthly-legacy-excel.ps1','src/weekly-legacy-excel.ps1']) {
    if(!has(rel))errors.push('Arquivo essencial ausente: '+rel);
  }
  const checks=files.filter(f=>READABLE.has(path.extname(f).toLowerCase()));
  for(const file of checks) {
    const rel=path.relative(root,file),data=fs.readFileSync(file);
    const invalid=forbiddenControls(data,path.extname(file).toLowerCase()==='.bat');
    if(invalid.length)errors.push(rel+': caracteres de controle inesperados nas posicoes '+invalid.slice(0,6).join(', '));
    if(path.extname(file).toLowerCase()!=='.js')continue;
    const contents=data.toString('utf8');
    for(const match of contents.matchAll(/\brequire\s*\(\s*['"](\.{1,2}\/[^'"\r\n]+)['"]\s*\)/g)) {
      if(!localFile(file,match[1]))errors.push(rel+': require local ausente '+match[1]);
    }
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',maxBuffer:1024*1024});
    if(result.status!==0)errors.push(rel+': sintaxe JS invalida: '+(result.stderr||'').trim().slice(0,300));
  }
  const htmlPath=path.join(root,'src/index.html');
  if(fs.existsSync(htmlPath)){
    const html=fs.readFileSync(htmlPath,'utf8');
    for(const m of html.matchAll(/\b(?:src|href)\s*=\s*['"]([^'"#]+)['"]/gi)){
      const asset=m[1].split('?')[0];
      if(/^(?:https?:|data:|mailto:|\/)/.test(asset))continue;
      if(!fs.existsSync(path.resolve(root,'src',asset)))errors.push('src/index.html: recurso ausente '+asset);
    }
  }
  for(const [key,command] of Object.entries(pkg.scripts||{})) {
    for(const match of command.matchAll(/\bnode\s+([^\s&]+\.js)\b/g)) {
      if(!has(match[1].replaceAll('\\','/')))errors.push('package.json script '+key+': '+match[1]+' ausente');
    }
  }
  const build=pkg.build||{};
  if(pkg.main&&!has(pkg.main))errors.push('package.json main ausente: '+pkg.main);
  if(build.win?.icon&&!has(build.win.icon))errors.push('Icone de build ausente: '+build.win.icon);
  for(const item of build.extraResources||[])if(item.from&&!has(item.from))errors.push('extraResources source ausente: '+item.from);
  for(const item of build.asarUnpack||[])if(!item.includes('*')&&!has(item))errors.push('asarUnpack source ausente: '+item);
  if(!build.win?.target?.includes('portable'))errors.push('Target portatil Windows ausente');
  for(const filename of ['VALIDAR_SEM_BUILD.bat','BUILD_WINDOWS.bat']) {
    const full=path.join(root,filename);
    if(!fs.existsSync(full))continue;
    const bat=fs.readFileSync(full,'utf8');
    for(const required of ['scripts\\preflight.js','scripts\\audit-gate.js','npm install','test:all']){
      if(!bat.includes(required))errors.push(filename+': comando esperado ausente: '+required);
    }
  }
  if(!has('package-lock.json'))warnings.push('Sem package-lock.json: npm install pode resolver versoes transitivas diferentes (versoes diretas estao fixadas).');
  return {errors,warnings,checked:checks.length};
}
function run() {
  const result=auditProject();
  for(const warning of result.warnings)console.warn('AVISO: '+warning);
  for(const error of result.errors)console.error('ERRO: '+error);
  if(result.errors.length){console.error('Preflight: FALHOU ('+result.errors.length+' problemas).');process.exitCode=1;return;}
  console.log('Preflight: PASS ('+result.checked+' arquivos de texto, imports locais, sintaxe JS, HTML, manifest e BATs).');
}
if(require.main===module)run();
module.exports={auditProject,forbiddenControls,allFiles};
