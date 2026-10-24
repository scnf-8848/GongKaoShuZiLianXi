/* =========================================================
   结算页：统计、明细筛选、再来一次
   ========================================================= */
(function(GK){
  'use strict';

  // 依赖（由前面加载的模块暴露到 GK）
  const {
    $, $$, clearDraft, fmtTime, go, nowStr, registry, saveRecord, st
  } = GK;

  /* ---------- 结算页 ---------- */

  // 记录一次练习的启动描述，供“再来一次”重用
  function recordLaunch(source, config){
    st.lastLaunch = { source, config: JSON.parse(JSON.stringify(config)) };
  }

  function showSummary(data, persist=true, launch){
    st.lastSummary = data;
    st.summaryFromHistory = !persist;   // 仅历史回看以 persist=false 调用
    // “再来一次”用的启动描述：历史回看用记录里的（可能为空），否则用最近一次真实练习。
    // 注意不能用 `launch || st.lastLaunch`：旧记录没有 launch 时会被错配成最近一次的配置。
    st.activeLaunch = (launch !== undefined) ? launch : st.lastLaunch;
    const againBtn = $('#sumAgain');
    if(againBtn) againBtn.disabled = !st.activeLaunch;
    const qs = data.questions;
    const total = data.totalSec;
    const correct = qs.filter(q=>q.correct).length;
    const acc = qs.length ? Math.round(correct/qs.length*100) : 0;
    const avg = qs.length ? (total/qs.length) : 0;

    $('#sumTitle').textContent = data.type + ' · 结算';
    $('#sumCount').textContent = correct + '/' + qs.length;
    $('#sumAcc').textContent = acc+'%';
    $('#sumTime').textContent = fmtTime(total);
    $('#sumAvg').textContent = avg.toFixed(1)+'s';

    st.summaryFilter = 'all';
    renderSummaryDetails();
    refreshSumFilter();

    // 保存记录（历史回看不重复保存）；同时存入启动描述供历史“再来一次”重跑
    if(persist){
      clearDraft();
      st.activePractice = null;
      saveRecord({
        type: data.type,
        time: nowStr(),
        count: qs.length,
        correct,
        acc,
        totalSec: total,
        avgSec: avg,
        allowedErr: data.allowedErr,
        launch: st.lastLaunch ? JSON.parse(JSON.stringify(st.lastLaunch)) : null,
        questions: qs.map(q=>({
          expr:q.expr, answer:q.answer,
          displayAnswer: q.displayAnswer || String(q.answer),
          errorPct: q.errorPct || '-',
          user: q.userText!==undefined?q.userText:(q.user||''),
          correct:q.correct, usedSec:q.usedSec
        }))
      });
    }

    go('summary');
  }

  /* 统一重跑一次练习：根据启动描述恢复配置并进入对应练习。
     source: basic | square | bhf；config 为对应模块配置的快照。
     各模块把「还原配置 + 启动」注册成 starter，这里只负责分发。 */
  function launchPractice(source, config){
    const starter = registry.starters[source] || registry.starters.basic;
    if(starter) starter(config);
  }

  /* ---------- 结算明细筛选 ---------- */
  // 本次结算的允许误差（%）：百化分依配置（1 或 2），平方数无容差为 0，其余为 2
  function summaryErrBound(){
    if(st.lastSummary && st.lastSummary.type.includes('百化分'))
      return st.lastSummary.allowedErr !== undefined ? st.lastSummary.allowedErr : GK.bhfAllowedErr();
    if(st.lastSummary && st.lastSummary.type.includes('平方数')) return 0;
    return 2;
  }
  // 档位按钮文案（含误差范围）：优秀=误差<允许一半，合格=误差在允许内，不合格=超差或答错
  function tierLabel(k){
    const E = summaryErrBound();
    if(E <= 0) return { ok:'优秀', warn:'合格', err:'不合格' }[k];   // 平方数无误差概念，只分对错
    const half = E/2;
    return { ok:`优秀（<${half}%）`, warn:`合格（${half}%~${E}%）`, err:`不合格（>${E}%）` }[k];
  }
  // 计算某题的分类档位：ok=优秀, warn=合格, err=不合格
  function summaryTierOf(q){
    const E = summaryErrBound();
    if(!q.correct) return 'err';
    if(E <= 0) return 'ok';   // 平方数：无容差，判题即分对错
    const err = summaryErrPctOf(q);
    // 「合格」界限 = 「不合格」界限的一半：不合格2%则合格1%，不合格1%则合格0.5%
    if(err === null || err < E/2) return 'ok';
    return err <= E ? 'warn' : 'err';
  }
  function summaryErrPctOf(q){
    const user = q.user!==undefined ? q.user : q.userText;
    const ans = q.answer;
    if(user===null || user===undefined || ans===0) return null;
    if(typeof user === 'string'){ if(user==='未填'||user==='(查看答案)'||user===''||isNaN(parseFloat(user))) return null; }
    const u = +user; if(isNaN(u)) return null;
    if(u === ans) return 0;
    return Math.abs(u-ans)/Math.abs(ans)*100;
  }
  // 更新筛选按钮的计数
  function refreshSumFilter(){
    if(!st.lastSummary) return;
    const qs = st.lastSummary.questions;
    const cnt = { all:qs.length, ok:0, warn:0, err:0 };
    qs.forEach(q=>cnt[summaryTierOf(q)]++);
    ['ok','warn','err'].forEach(k=>{
      const b = $(`#sumFilter .seg[data-f="${k}"]`);
      if(b) b.textContent = tierLabel(k) + ` (${cnt[k]})`;
    });
    const allB = $('#sumFilter .seg[data-f="all"]');
    if(allB) allB.textContent = `全部 (${cnt.all})`;
    $$('#sumFilter .seg').forEach(x=>x.classList.toggle('active', x.dataset.f === st.summaryFilter));
  }
  // 按当前筛选渲染明细
  function renderSummaryDetails(){
    if(!st.lastSummary) return;
    const data = st.lastSummary;
    const detail = $('#sumDetail');
    if(!detail) return;
    const isFixed = data.type.includes('固定题数');
    detail.className = 'detail-list' + (isFixed ? ' no-time' : '');
    detail.innerHTML = '';
    const isFill = data.answerMode !== 'choice';   // 填空模式（含平方数练习）
    const qs = data.questions.filter(q=> st.summaryFilter==='all' || summaryTierOf(q)===st.summaryFilter);
    qs.forEach((q, di)=>{
      const tier = summaryTierOf(q);
      const row = document.createElement('div');
      row.className = 'detail-item ' + tier + (isFixed?' no-time':'');
      const da = q.displayAnswer || String(q.answer);
      const ep = q.errorPct || '-';
      const tm = (!isFixed && q.usedSec !== undefined) ? q.usedSec.toFixed(1)+'s' : '';
      const userVal = q.userText!==undefined ? q.userText : (q.user!==undefined ? q.user : '');
      row.innerHTML = `
        <span class="di-idx">${di+1}</span>
        <span class="di-q">${q.expr} = ${da}</span>
        <span class="di-a ${tier}">${q.correct ? (isFill ? '✔ ' + userVal : '✔') : ('✘ ' + userVal)}</span>
        <span class="di-t">${ep}</span>
        ${isFixed ? '' : `<span class="di-time">${tm}</span>`}
      `;
      detail.appendChild(row);
    });
  }

  /* ---------- 对外暴露 ---------- */
  Object.assign(GK, {
    launchPractice, recordLaunch, refreshSumFilter, renderSummaryDetails, showSummary
  });
})(window.GK = window.GK || {});
