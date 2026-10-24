/* =========================================================
   存储：历史记录 + 未完成练习草稿（意外退出保护）
   ========================================================= */
(function(GK){
  'use strict';

  // 依赖（由前面加载的模块暴露到 GK）
  const {
    $, LS_DRAFT, LS_KEY, fmtTime, nowStr, onEnter, st
  } = GK;

  /* ---------- 历史记录 ---------- */
  const MAX_RECORDS = 50;   // 每条记录含全部题目明细，50 条约 100~200KB，远低于 localStorage 上限

  function loadRecords(){
    try{
      const v = JSON.parse(localStorage.getItem(LS_KEY));
      return Array.isArray(v) ? v : [];
    }catch(e){ return []; }
  }
  function saveRecord(r){
    try{
      const list = loadRecords();
      list.unshift(r);
      while(list.length>MAX_RECORDS) list.pop();
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    }catch(e){
      console.warn('保存练习记录失败（本地存储不可用或已满）', e);
    }
  }

  /* ---------- 未完成练习草稿（意外退出保护） ---------- */

  function loadDraft(){
    try{
      const d = JSON.parse(localStorage.getItem(LS_DRAFT) || 'null');
      return d && Array.isArray(d.questions) && d.questions.length ? d : null;
    }catch(e){ return null; }
  }
  function clearDraft(){
    try{ localStorage.removeItem(LS_DRAFT); }catch(e){}
  }
  // 把当前练习的已完成题目写入草稿；每答一题及页面隐藏/关闭时调用
  function checkpointDraft(){
    if(!st.activePractice) return;
    let data;
    try{ data = st.activePractice(); }catch(e){ return; }
    if(!data || !data.questions || !data.questions.length) return;
    data.savedAt = Date.now();
    try{ localStorage.setItem(LS_DRAFT, JSON.stringify(data)); }catch(e){}
  }
  // 输入框类高频调用的落盘：合并成一次，避免每次按键都同步写 localStorage
  function scheduleDraft(){
    if(st.draftTimer) return;
    st.draftTimer = setTimeout(()=>{ st.draftTimer = null; checkpointDraft(); }, 250);
  }
  // 进入首页时，把上次意外中断留下的草稿直接保存为一条记录
  function saveDraftAsRecord(){
    const d = loadDraft();
    if(!d) return;
    const qs = d.questions;
    const correct = qs.filter(q=>q.correct).length;
    saveRecord({
      type: d.type,
      time: d.time || nowStr(),
      count: qs.length,
      correct,
      acc: qs.length ? Math.round(correct/qs.length*100) : 0,
      totalSec: d.totalSec || 0,
      avgSec: qs.length ? (d.totalSec||0)/qs.length : 0,
      allowedErr: d.allowedErr,
      launch: d.launch || null,
      questions: qs
    });
    clearDraft();
  }
  /* 历史页顶部：累计统计 + 最近若干次正确率趋势
     - 正确率按「累计答对 / 累计题数」算，避免 1 题的练习和 20 题的练习等权
     - 均每题用时同样按题数加权（总时长 / 总题数） */
  function renderHistorySummary(list){
    const box = $('#historySummary');
    if(!box) return;
    if(!list.length){ box.innerHTML = ''; return; }
    let totalQ = 0, totalCorrect = 0, totalSec = 0;
    list.forEach(r=>{
      totalQ += (+r.count || 0);
      totalCorrect += (+r.correct || 0);
      totalSec += (+r.totalSec || 0);
    });
    const acc = totalQ ? Math.round(totalCorrect/totalQ*100) : 0;
    const avg = totalQ ? totalSec/totalQ : 0;
    // 趋势图按时间正序（左旧右新）；最多取最近 12 次
    const recent = list.slice(0, 12).reverse();
    const bars = recent.map(r=>{
      const a = Math.max(0, Math.min(100, +r.acc || 0));
      const tone = a>=85 ? 'ok' : (a>=70 ? 'warn' : 'err');
      return `<i class="hs-bar ${tone}" style="height:${Math.max(6,a)}%" title="${r.time || ''} · ${a}%"></i>`;
    }).join('');
    box.innerHTML = `
      <div class="hs-stats">
        <span>累计 <b>${list.length}</b> 次</span>
        <span>题数 <b>${totalQ}</b></span>
        <span>正确率 <b>${acc}%</b></span>
        <span>均/题 <b>${avg.toFixed(1)}s</b></span>
      </div>
      <div class="hs-chart">${bars}</div>
      <div class="hs-note">最近 ${recent.length} 次正确率走势（左旧右新，最多保留 ${MAX_RECORDS} 次）</div>
    `;
  }

  function renderHistory(){
    const list = loadRecords();
    const wrap = $('#historyList');
    renderHistorySummary(list);
    if(list.length===0){
      wrap.innerHTML = '<div class="history-empty">暂无练习记录</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach((r,i)=>{
      const cnt = +r.count || 0, right = +r.correct || 0;
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="hi-top">
          <span class="hi-type">${r.type || '练习'}</span>
          <span class="hi-time">${r.time || ''}</span>
        </div>
        <div class="hi-stats">
          <span>题数 <b>${cnt}</b></span>
          <span>正确率 <b>${+r.acc || 0}%</b></span>
          <span>总时长 <b>${fmtTime(r.totalSec)}</b></span>
          <span>均/题 <b>${(+r.avgSec || 0).toFixed(1)}s</b></span>
        </div>
        <div class="hi-stats" style="margin-top:4px;">
          <span>正确 <b style="color:var(--ok)">${right}</b></span>
          <span>错误 <b style="color:var(--err)">${Math.max(0, cnt-right)}</b></span>
        </div>
      `;
      el.addEventListener('click', ()=>showHistoryDetail(r));
      wrap.appendChild(el);
    });
  }
  function showHistoryDetail(r){
    const qs = Array.isArray(r.questions) ? r.questions : [];   // 兼容字段残缺的旧记录
    GK.showSummary({
      type: (r.type || '练习') + '（历史回看）',
      questions: qs.map(q=>({
        expr:q.expr, answer:q.answer,
        displayAnswer: q.displayAnswer || String(q.answer),
        errorPct: q.errorPct || '-',
        userText: q.user, correct:q.correct, usedSec:q.usedSec, user:q.user
      })),
      totalSec: r.totalSec,
      allowedErr: r.allowedErr
    }, false, r.launch);
  }

  // 视图钩子：进入历史页渲染列表；回首页把中断的草稿转成一条记录
  onEnter('history', renderHistory);
  onEnter('home', saveDraftAsRecord);

  /* ---------- 对外暴露 ---------- */
  Object.assign(GK, {
    checkpointDraft, clearDraft, renderHistory, saveRecord, scheduleDraft
  });
})(window.GK = window.GK || {});
