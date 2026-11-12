#!/usr/bin/env node
'use strict';
/*
 * npm audit exit code 1 can mean only a MODERATE alert in dev-only packages.
 * We still block on MODERATE+ vulnerabilities in shipped dependencies,
 * HIGH+ vulnerabilities anywhere, and any audit/registry failure.
 * No automatic dependency upgrades are performed by this gate.
 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const counts = (payload) => {
  if (!payload || typeof payload !== 'object' || payload.error ||
      !payload.metadata || !payload.metadata.vulnerabilities) {
    throw new Error('npm audit nao retornou um relatorio valido.');
  }
  const v = payload.metadata.vulnerabilities;
  for (const severity of ['moderate', 'high', 'critical']) {
    if (!Number.isInteger(v[severity]) || v[severity] < 0) {
      throw new Error('npm audit sem contagem confiavel para '+severity+'.');
    }
  }
  return v;
};

function assess(full, production) {
  const all = counts(full);
  const prod = counts(production);
  const reasons = [];
  if (all.high || all.critical) {
    reasons.push('Existem vulnerabilidades HIGH/CRITICAL na arvore completa.');
  }
  if (prod.moderate || prod.high || prod.critical) {
    reasons.push('Existem vulnerabilidades MODERATE+ em dependencias de producao.');
  }
  return {ok: reasons.length === 0, reasons, all, prod,
    moderateDevOnly: Math.max(0, (all.moderate || 0) - (prod.moderate || 0))};
}

function audit(args, file) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(cmd, ['audit', '--json', ...args], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024, windowsHide: true,
    shell: process.platform === 'win32'
  });
  const stdout = result.stdout || '';
  fs.writeFileSync(file, stdout || result.stderr || '', 'utf8');
  if (result.error) throw result.error;
  let parsed;
  try { parsed = JSON.parse(stdout); }
  catch { throw new Error('Falha ao ler resultado do npm audit. Veja '+file+' e verifique a conexao.'); }
  const v = counts(parsed);
  // npm returns 1 on reported vulnerabilities, but other codes indicate a failed audit.
  if (typeof result.status !== 'number' || result.status > 1 ||
      (result.status !== 0 && !(v.total > 0))) {
    throw new Error('npm audit nao concluiu. Veja '+file+' (exit '+result.status+').');
  }
  return parsed;
}

function run() {
  const out = path.resolve(__dirname, '..', 'diagnostico_npm');
  fs.mkdirSync(out, {recursive:true});
  const fullFile = path.join(out, 'npm-audit-completo-v261.json');
  const prodFile = path.join(out, 'npm-audit-producao-v261.json');
  console.log('Auditando todas as dependencias (alerta HIGH+ bloqueia)...');
  const full = audit([], fullFile);
  console.log('Auditando dependencias do aplicativo (MODERATE+ bloqueia)...');
  const prod = audit(['--omit=dev'], prodFile);
  const decision = assess(full, prod);
  const fmt = v => ['moderate','high','critical'].map(s=>s+': '+v[s]).join(' | ');
  console.log('Auditoria completa: '+fmt(decision.all));
  console.log('Dependencias de producao: '+fmt(decision.prod));
  if (!decision.ok) {
    console.error('BLOQUEADO: '+decision.reasons.join(' '));
    console.error('Nao executar npm audit fix --force sem revisar compatibilidade.');
    process.exitCode=1;
    return;
  }
  if (decision.moderateDevOnly > 0) {
    console.warn('ATENCAO: '+decision.moderateDevOnly+
      ' alertas MODERATE restritos as ferramentas de desenvolvimento/build.');
    console.warn('Os alertas NAO foram corrigidos; relatorios salvos em diagnostico_npm.');
    console.warn('Build permitido sob esta politica; revise/atualize as ferramentas quando houver solucao compativel.');
  } else {
    console.log('Sem alertas MODERATE+ relevantes para o bloqueio.');
  }
  console.log('Politica de auditoria: PASS');
}
if (require.main === module) {
  try {run();} catch(err) { console.error('Falha na auditoria: '+err.message); process.exitCode=1; }
}
module.exports = {assess, counts};
