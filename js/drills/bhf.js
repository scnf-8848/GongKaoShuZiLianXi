/* =========================================================
   百化分练习：配置 + 出题 + 判题 + 单题 / 固定题数
   ========================================================= */
(function(GK){
  'use strict';

  // 依赖（由前面加载的模块暴露到 GK）
  const {
    $, $$, BHF_PRESET_ALL, adaptPick, adaptReset, adaptUpdate, bindSegTo, closeBHFChart, createFixedTimer, createSingleDrill, go, isTouchDevice, nowStr, rand, recordLaunch, registerStarter, registerStop, scheduleDraft, showSummary, st, tuneInput
  } = GK;

  /* ---------- 百化分练习 ----------
     在选中范围内随机生成最多 1 位小数的百分数 p，
     用户回答对应分数 1/(100/p) 的分母，精确答案保留 1 位小数。
     允许误差：默认 2%；勾选“仅从上图百分数中出题”（limitPreset）时收紧到 1%，
     若同时开启“允许互换出题”（swap）则放宽到 1.5%（反向题存在分母保留 1 位小数的往返舍入）。 */
  // 范围按全开区间处理（(1,10)、(10,20)、(20,50)）：端点值 1%、10%、20%、50% 为纯定义/常识，不纳入出题
  const BHF_RANGES = { '1-10':[1,10], '10-20':[10,20], '20-50':[20,50] };
  const bhfCfg = { ranges:new Set(), mode:'single', count:5, limitPreset:false, swap:false, repeatWrong:false };

  // 百化分允许误差（%）：勾选“仅从上图百分数中出题”时收紧到 1%；
  // 同时开启“允许互换出题”时放宽到 1.5%：正反向统一，覆盖反向题分母保留 1 位小数的往返舍入（最大约 1.45%）
  function bhfAllowedErr(){
    if(!bhfCfg.limitPreset) return 2;
    return bhfCfg.swap ? 1.5 : 1;
  }

  function initBHFChips(){
    const wrap = $('#bhfRange');
    if(!wrap) return;
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('.chip'); if(!b) return;
      const key = b.dataset.range;
      bhfCfg.ranges.has(key) ? bhfCfg.ranges.delete(key) : bhfCfg.ranges.add(key);
      b.classList.toggle('active', bhfCfg.ranges.has(key));
      updateBHFConfigTip(wrap);
    });
    const lim = $('#bhfLimitPreset');
    if(lim) lim.addEventListener('change', ()=> bhfCfg.limitPreset = lim.checked);
    const sw = $('#bhfSwap');
    if(sw) sw.addEventListener('change', ()=> bhfCfg.swap = sw.checked);
  }
  function updateBHFConfigTip(wrap){
    const tip = $('#bhfCfgTip');
    if(tip) tip.textContent = (bhfCfg.ranges.size===0 && !$('.chip.active',wrap)) ? '请至少选择一个范围' : '';
  }

  // 候选百分数池：勾选“仅从上图百分数中出题”时返回按所选范围筛选的预设值；
  // 未勾选时返回 null（随机小数的连续池，不参与频率记忆）
  function bhfCandidates(){
    if(!bhfCfg.limitPreset) return null;
    const keys = Array.from(bhfCfg.ranges);
    const cands = [];
    keys.forEach(key=>{
      const [min, max] = BHF_RANGES[key];
      BHF_PRESET_ALL.forEach(p=>{ if(p>min && p<max) cands.push(p); });   // 开区间：剔除端点值
    });
    return cands.length ? cands : null;
  }
  // 由源百分数生成一道题：开启“允许互换出题”时，每题随机选择正向或反向（反向把原分母作为题面，原百分数作为答案）
  function bhfMakeQuestion(p){
    const rev = bhfCfg.swap && Math.random() < 0.5;
    const q = rev ? bhfAnswer(p) : p;
    return { p, rev, q, answer:bhfAnswer(q) };
  }
  // 题面百分数是否为同一个（保留 1 位小数，用容差比较）
  function bhfSameQ(a, b){
    return a !== null && b !== null && Math.abs(a-b) < 0.05;
  }
  // 生成一道新题；lastQ 为上一题题面百分数，尽量避免与其相同。
  // adaptive=true 时按记忆频率加权选源百分数（单题模式）
  function bhfGenQuestion(lastQ, adaptive){
    const cands = bhfCandidates();
    if(cands){
      let pool = cands;
      // 未开启互换时方向固定，可直接从池中剔除上一题
      if(!bhfCfg.swap && pool.length>1 && lastQ !== null){
        const filtered = pool.filter(p=>!bhfSameQ(p, lastQ));
        if(filtered.length) pool = filtered;
      }
      // 互换开启时同一源百分数有正反两种题面，随机取向后重试，避免与上一题题面相同
      for(let k=0;k<4;k++){
        const p = adaptive ? adaptPick(pool) : pool[rand(0, pool.length-1)];
        const q = bhfMakeQuestion(p);
        if(!bhfSameQ(q.q, lastQ) || k===3) return q;
      }
    }
    const keys = Array.from(bhfCfg.ranges);
    for(let k=0;k<4;k++){
      const key = keys[rand(0, keys.length-1)];
      const [min, max] = BHF_RANGES[key];
      const p = rand(min*10+1, max*10-1)/10;   // 开区间：剔除端点值（如 1.0、10.0、20.0、50.0）
      const q = bhfMakeQuestion(p);
      if(!bhfSameQ(q.q, lastQ) || k===3) return q;
    }
  }
  // 精确答案 = 1/(p/100) = 100/p，保留 1 位小数
  function bhfAnswer(p){
    const v = Math.round(1000/p)/10;   // 保留 1 位
    return Math.round(v)===v ? Math.round(v) : v;
  }
  // 数值显示：去掉整数部分的尾随 .0（如 10.0 → 10）
  function bhfStrip(v){
    return Math.round(v)===v ? String(Math.round(v)) : String(v);
  }
  // 判题：用户答案相对精确答案误差 ≤ 允许误差（默认 2%，勾选上图预设时 1%）
  function bhfCheck(user, ans){
    return Math.abs(user-ans)/ans <= bhfAllowedErr()/100;
  }
  // 用户答案相对精确答案的误差百分比显示（未作答/查看答案等返回 '-'）
  function bhfErrPct(user, ans){
    if(user===null || user===undefined) return '-';
    if(typeof user === 'string'){
      if(user==='' || user==='未填' || user==='(查看答案)') return '-';
    }
    const u = +user; if(isNaN(u) || ans===0) return '-';
    const pct = Math.abs(u-ans)/Math.abs(ans)*100;
    if(pct < 0.005) return '0%';
    if(pct < 0.01) return '<0.01%';
    return pct.toFixed(1)+'%';
  }
  // 输入清洗：仅保留数字与一个小数点，且最多一位小数
  function bhfSanitize(v){
    v = v.replace(/[^\d.]/g,'').replace(/(\..*)\./g,'$1');
    const di = v.indexOf('.');
    if(di >= 0) v = v.slice(0, di+2);
    return v;
  }

  // 百化分配置 UI 与 bhfCfg 状态保持一致
  function syncBHFCfgUI(){
    const rangeWrap = $('#bhfRange');
    if(rangeWrap) $$('.chip',rangeWrap).forEach(c=>{
      c.classList.toggle('active', bhfCfg.ranges.has(c.dataset.range));
    });
    bindSegTo('bhfMode', bhfCfg.mode);
    bindSegTo('bhfCount', bhfCfg.count);
    const rw = $('#bhfRepeatWrongWrap'); if(rw) rw.style.display = bhfCfg.mode==='single' ? '' : 'none';
    const fw = $('#bhfFixedCountWrap'); if(fw) fw.style.display = bhfCfg.mode==='fixed' ? '' : 'none';
    const lim = $('#bhfLimitPreset'); if(lim) lim.checked = bhfCfg.limitPreset;
    const sw = $('#bhfSwap'); if(sw) sw.checked = bhfCfg.swap;
    const cb = $('#bhfRepeatWrong'); if(cb) cb.checked = bhfCfg.repeatWrong;
  }
  // 「再来一次」：按快照还原配置并启动
  function applyBHFCfg(config){
    bhfCfg.ranges = new Set(config.ranges);
    bhfCfg.mode = config.mode || 'single';
    bhfCfg.count = config.count || 5;
    bhfCfg.limitPreset = !!config.limitPreset;
    bhfCfg.swap = !!config.swap;
    bhfCfg.repeatWrong = !!config.repeatWrong;
    syncBHFCfgUI();
    if(bhfCfg.mode==='single') startBHFHandSingle();
    else startBHFHandFixed();
  }
  registerStarter('bhf', applyBHFCfg);

  /* ---------- 百化分单题练习 ---------- */
  const bhfSingle = {
    questions:[], cur:null, lastQ:null, curStart:0, start:0,
    timer:null, autoNextTimer:null, autoNextPending:false,
    // 错题重复：记下待重做的整道题（含出题方向）
    pending:null,
    // 当前题是否为错题重做（重做不计入出题频率调整）
    isRepeat:false,
    paused:false, pauseStart:0, pausedTotal:0
  };

  const bhfSingleDrill = createSingleDrill({
    state: bhfSingle,
    view: 'bhf-single',
    ui: {
      pause:'#bhfsPause', input:'#bhfsFracInput', numpad:'#bhfsNumpad', feedback:'#bhfsFeedback',
      time:'#bhfsTotalTime', count:'#bhfsCount', acc:'#bhfsAcc', avg:'#bhfsAvg', cur:'#bhfsCur'
    },
    onStart(){
      st.lastPracticeSource = 'bhf';
      recordLaunch('bhf', { ranges: [...bhfCfg.ranges], mode: bhfCfg.mode, count: bhfCfg.count, limitPreset: bhfCfg.limitPreset, swap: bhfCfg.swap, repeatWrong: bhfCfg.repeatWrong });
      adaptReset();   // 本次练习的记忆频率从零开始
      const note = $('#bhfPadNote'); if(note) note.textContent = '误差≤' + bhfAllowedErr() + '%';
      closeBHFChart();
      // 意外退出保护：每答一题把已完成题目写入草稿
      st.activePractice = ()=>({
        type:'百化分练习（单题）',
        time: nowStr(),
        launch: st.lastLaunch ? JSON.parse(JSON.stringify(st.lastLaunch)) : null,
        totalSec: ((bhfSingle.paused ? bhfSingle.pauseStart : Date.now()) - bhfSingle.start - bhfSingle.pausedTotal)/1000,
        allowedErr: bhfAllowedErr(),
        questions: bhfSingle.questions.map(q=>({
          expr: bhfStrip(q.q)+'% = 1/？', answer:q.answer,
          displayAnswer:String(q.answer), errorPct: bhfErrPct(q.user, q.answer),
          user: (q.user===null || q.user===undefined) ? '' : String(q.user),
          correct:q.correct, usedSec:q.usedSec
        }))
      });
    },
    makeQuestion(){
      if(bhfCfg.ranges.size === 0) return null;
      // 若非空待重做错题，则用原题重做（不计频率调整）；否则重新生成（避免与上一题题面相同）
      const isRepeat = bhfSingle.pending !== null;
      const cur = isRepeat ? bhfSingle.pending : bhfGenQuestion(bhfSingle.lastQ, true);
      if(isRepeat) bhfSingle.pending = null;
      bhfSingle.lastQ = cur.q;   // 记录本题题面，供下一题避免连续重复
      bhfSingle.isRepeat = isRepeat;
      return cur;
    },
    renderQuestion(cur, index){
      $('#bhfsIndex').textContent = `第 ${index} 题`;
      $('#bhfsExpr .bhf-expr-p').textContent = bhfStrip(cur.q) + '%';
      const inp = $('#bhfsFracInput');
      inp.value = '';
      inp.disabled = false;
      tuneInput(inp, 'decimal');
      $$('.numpad-key', $('#bhfsNumpad')).forEach(k=>k.disabled = false);
      $('#bhfsFeedback').className = 'feedback';
      $('#bhfsFeedback').textContent = '';
      if(!isTouchDevice()) inp.focus();
    },
    evaluate(raw, cur, usedSec){
      if(raw==='') return { invalid:'请输入分母' };
      const user = parseFloat(raw);
      if(isNaN(user)) return { invalid:'请输入有效数字' };
      const ans = cur.answer;
      const correct = bhfCheck(user, ans);
      // 仅图出题时更新频率；重做不计；只有零误差（user===ans）才允许降频，判对但带误差权重不变
      if(bhfCfg.limitPreset && !bhfSingle.isRepeat) adaptUpdate(cur.p, correct, usedSec, user === ans);
      if(!correct && bhfCfg.repeatWrong) bhfSingle.pending = Object.assign({}, cur);   // 错题重做（保留原出题方向）
      return {
        cls: correct ? 'ok' : 'err',
        text: correct ? `✓ 正确，分母约 ${ans}` : `✗ 错误，精确值 ${ans}，误差 >${bhfAllowedErr()}%`,
        delay: correct ? 300 : 1200,
        correct,
        info: { user, correct }
      };
    },
    toRecord(cur, info, usedSec){
      return { q:cur.q, answer:cur.answer, user:info.user, correct:info.correct, usedSec };
    },
    skipRecord(cur, usedSec){
      return { q:cur.q, answer:cur.answer, user:null, correct:false, usedSec };
    },
    reveal(cur, usedSec){
      // 查看答案视同答错，提高频率；重做不计
      if(bhfCfg.limitPreset && !bhfSingle.isRepeat) adaptUpdate(cur.p, false, usedSec, false);
      if(bhfCfg.repeatWrong) bhfSingle.pending = Object.assign({}, cur);   // 查看答案视同答错，重做（保留原出题方向）
      return {
        text: `答案：${cur.answer}（点击"跳过"继续）`,
        record: { q:cur.q, answer:cur.answer, user:'(查看答案)', correct:false, usedSec }
      };
    },
    lockAfterAnswer(){
      $('#bhfsFracInput').disabled = true;
      $$('.numpad-key', $('#bhfsNumpad')).forEach(k=>k.disabled = true);
    },
    summary(){
      return {
        type:'百化分练习（单题）',
        questions: bhfSingle.questions.map(q=>({
          expr: bhfStrip(q.q)+'% = 1/？', answer: q.answer,
          displayAnswer: String(q.answer), errorPct: bhfErrPct(q.user, q.answer),
          userText: q.user===null ? '' : String(q.user), correct: q.correct, usedSec: q.usedSec
        })),
        totalSec: (Date.now() - bhfSingle.start - bhfSingle.pausedTotal)/1000,   // 扣除暂停时长，统计纯练习用时
        allowedErr: bhfAllowedErr()
      };
    }
  });

  function startBHFHandSingle(){ bhfSingleDrill.start(); }
  function toggleBHFHandPause(){ bhfSingleDrill.togglePause(); }
  function nextBHFHandSingle(isFirst){ bhfSingleDrill.next(isFirst); }
  function submitBHFHandSingle(){ bhfSingleDrill.submit(); }
  function revealBHFHandSingle(){ bhfSingleDrill.reveal(); }
  function endBHFHandSingle(){ bhfSingleDrill.end(); }
  function stopBHFHandSingleTimers(){ bhfSingleDrill.stop(); }

  /* ---------- 百化分固定题数练习 ---------- */
  const bhfFixed = {
    questions:[], start:0, timer:null,
    paused:false, pauseStart:0, pausedTotal:0
  };

  function bhfFixedDoneCount(){
    return bhfFixed.questions.filter(q=>q.userText!=='').length;
  }

  const bhfFixedTimer = createFixedTimer({
    state: bhfFixed,
    ui: { time:'#bhfTotalTime', pause:'#bhfPause' },
    onTick(){ $('#bhfDone').textContent = bhfFixedDoneCount(); },
    lock(paused){ $$('.fi-input', $('#bhfList')).forEach(i=>i.disabled = paused); }
  });

  function startBHFHandFixed(){
    st.lastPracticeSource = 'bhf';
    recordLaunch('bhf', { ranges: [...bhfCfg.ranges], mode: bhfCfg.mode, count: bhfCfg.count, limitPreset: bhfCfg.limitPreset, swap: bhfCfg.swap, repeatWrong: bhfCfg.repeatWrong });
    // 意外退出保护：已填写的题按当前作答批改后写入草稿
    st.activePractice = ()=>{
      const totalSec = bhfFixedTimer.elapsedSec();
      const per = bhfFixed.questions.length ? totalSec/bhfFixed.questions.length : 0;
      const answered = bhfFixed.questions.filter(q=>q.userText!=='' && !isNaN(parseFloat(q.userText)));
      return {
        type:'百化分练习（固定题数）',
        time: nowStr(),
        launch: st.lastLaunch ? JSON.parse(JSON.stringify(st.lastLaunch)) : null,
        totalSec,
        allowedErr: bhfAllowedErr(),
        questions: answered.map(q=>{
          const u = parseFloat(q.userText);
          return {
            expr: bhfStrip(q.q)+'% = 1/？', answer:q.answer,
            displayAnswer:String(q.answer), errorPct: bhfErrPct(u, q.answer),
            user:String(u), correct:bhfCheck(u, q.answer), usedSec:per
          };
        })
      };
    };
    const n = bhfCfg.count;
    if(bhfCfg.ranges.size===0) return;
    bhfFixed.questions = [];
    let lastQ = null;
    for(let i=0;i<n;i++){
      const q = bhfGenQuestion(lastQ, false);   // 内部已避免与上一题题面相同
      bhfFixed.questions.push({ p:q.p, rev:q.rev, q:q.q, answer:q.answer, userText:'', correct:false, usedSec:0 });
      lastQ = q.q;
    }
    bhfFixed.start = Date.now();
    const list = $('#bhfList');
    list.innerHTML = '';
    bhfFixed.questions.forEach((q,i)=>{
      const item = document.createElement('div');
      item.className = 'fixed-item';
      item.innerHTML = `
        <span class="fi-idx">${i+1}</span>
        <span class="fi-expr">${bhfStrip(q.q)}% = 1/</span>
        <input class="fi-input" inputmode="decimal" autocomplete="off" data-i="${i}" placeholder="分母 ?" />
      `;
      list.appendChild(item);
    });
    // 用 on* 赋值避免重复开始练习时监听器累积
    list.oninput = onBHFHandFixedInput;
    $('#bhfCount2').textContent = n;
    bhfFixedTimer.start();
    closeBHFChart();
    go('bhf-fixed');
  }

  function onBHFHandFixedInput(e){
    const inp = e.target.closest('.fi-input'); if(!inp) return;
    const i = +inp.dataset.i;
    const item = inp.closest('.fixed-item');
    // 与单题模式保持一致：仅允许数字与一位小数
    const clean = bhfSanitize(inp.value);
    if(clean !== inp.value) inp.value = clean;
    const val = inp.value.trim();
    bhfFixed.questions[i].userText = val;
    scheduleDraft();
    if(val===''){ item.classList.remove('done'); return; }
    item.classList.add('done');
    $('#bhfDone').textContent = bhfFixedDoneCount();
  }

  function submitBHFHandFixed(){
    const blank = bhfFixed.questions.filter(q=> q.userText==='' || q.userText===undefined).length;
    if(blank > 0 && !confirm(`还有 ${blank} 题未作答，确定直接结算？`)) return;
    const totalSec = bhfFixedTimer.elapsedSec();   // 扣除暂停时长，统计纯练习用时
    const per = bhfFixed.questions.length ? totalSec/bhfFixed.questions.length : 0;
    bhfFixed.questions.forEach(q=>{
      const u = q.userText==='' ? null : parseFloat(q.userText);
      if(u !== null){
        q.correct = bhfCheck(u, q.answer);
        q.userText = String(u);
      }else{
        q.correct = false;
        q.userText = '未填';
      }
      q.usedSec = per;
    });
    stopBHFHandFixedTimers();
    showSummary({
      type:'百化分练习（固定题数）',
      questions: bhfFixed.questions.map(q=>({
        expr: bhfStrip(q.q)+'% = 1/？', answer: q.answer,
        displayAnswer: String(q.answer), errorPct: bhfErrPct(q.userText, q.answer),
        userText: q.userText, correct: q.correct, usedSec: q.usedSec
      })),
      totalSec,
      allowedErr: bhfAllowedErr()
    });
  }

  function toggleBHFHandFixedPause(){ bhfFixedTimer.togglePause(); }

  function stopBHFHandFixedTimers(){
    bhfFixedTimer.stop();
  }
  function stopBHFAllTimers(){
    stopBHFHandSingleTimers();
    stopBHFHandFixedTimers();
  }
  registerStop(stopBHFAllTimers);

  /* ---------- 对外暴露 ---------- */
  Object.assign(GK, {
    bhfAllowedErr, bhfCfg, bhfSanitize, bhfSingle, endBHFHandSingle, initBHFChips, nextBHFHandSingle, revealBHFHandSingle, startBHFHandFixed, startBHFHandSingle, submitBHFHandFixed, submitBHFHandSingle, toggleBHFHandFixedPause, toggleBHFHandPause, updateBHFConfigTip
  });
})(window.GK = window.GK || {});
