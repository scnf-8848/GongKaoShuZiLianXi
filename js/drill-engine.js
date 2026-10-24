/* =========================================================
   单题练习公共引擎：计时 / 暂停 / 自动跳题 / 结算入口
   ========================================================= */
(function(GK){
  'use strict';

  // 依赖（由前面加载的模块暴露到 GK）
  // 注意：引擎里所有 state 都来自 conf.state，不碰 GK.st（全局只存"结算/草稿"相关的状态）
  const {
    $, $$, checkpointDraft, fmtTime, go, showSummary
  } = GK;

  /* ---------- 单题练习公共引擎 ----------
     三套单题练习（基本计算 / 平方数 / 百化分）的计时、暂停、自动跳题、跳过记错、
     结算入口完全同构，这里只保留一份实现；各模块通过 conf 提供业务钩子：
       state            状态对象（由模块持有，含 questions/cur/curStart/timer 等字段）
       view             进入的视图 id
       ui               相关 DOM 选择器 {pause,input,numpad,feedback,time,count,acc,avg,cur}
       onStart()        启动前的模块专属准备（记录 launch、重置权重等）
       makeQuestion()   生成本题；返回 null 表示当前配置下无可出题
       renderQuestion(q, 题号)  渲染题面并重置输入
       evaluate(raw, q, usedSec)
                        判题；返回 {invalid} 表示输入不合法，或
                        {cls,text,delay,correct,info} 表示一次完整作答
       toRecord(q, info, usedSec) / skipRecord(q, usedSec)
                        作答记录 / 跳过记录（两种记录的字段各模块不同）
       reveal(q, usedSec)  查看答案；返回 {text,record}
       lockAfterAnswer()   作答或看答案后禁用输入
       lockExtra(paused)   暂停时需一并锁定的额外控件（如选择题按钮）
       summary()          showSummary 的入参 */
  function createSingleDrill(conf){
    const st = conf.state;
    const ui = conf.ui || {};
    const pick = sel => sel ? $(sel) : null;
    const setText = (sel, v)=>{ const el = pick(sel); if(el) el.textContent = v; };
    const numpadKeys = ()=> ui.numpad ? $$('.numpad-key', pick(ui.numpad)) : [];

    function flash(type, msg){
      const fb = pick(ui.feedback);
      if(!fb) return;
      fb.className = 'feedback ' + type;
      fb.textContent = msg;
    }

    function tick(){
      // 暂停时用 pauseStart 作为参考时间，使计时冻结
      const now = st.paused ? st.pauseStart : Date.now();
      const elapsed = (now - st.start - st.pausedTotal)/1000;
      const n = st.questions.length;
      const correct = st.questions.filter(q=>q.correct).length;
      setText(ui.time, fmtTime(elapsed));
      setText(ui.count, n);
      setText(ui.acc, (n ? Math.round(correct/n*100) : 0) + '%');
      setText(ui.avg, (n ? (elapsed/n).toFixed(1) : '0.0') + 's');
      if(st.curStart) setText(ui.cur, Math.max(0, (now - st.curStart)/1000).toFixed(1) + 's');
    }

    function start(){
      if(conf.onStart) conf.onStart();
      // 每轮重置暂停状态，避免沿用上次练习的累计暂停时长导致计时为负
      st.questions = [];
      st.cur = null;
      st.paused = false;
      st.pauseStart = 0;
      st.pausedTotal = 0;
      st.autoNextPending = false;
      st.start = Date.now();
      st.timer = setInterval(tick, 200);
      go(conf.view);
      next(true);   // 先切视图再出题，确保输入框可见后 focus 才生效
    }

    function togglePause(){
      const btn = pick(ui.pause);
      const inp = pick(ui.input);
      if(!st.paused){
        st.paused = true;
        st.pauseStart = Date.now();
        if(btn){ btn.textContent = '继续'; btn.classList.add('paused'); }
        if(inp) inp.disabled = true;
        numpadKeys().forEach(k=>k.disabled = true);
        if(conf.lockExtra) conf.lockExtra(true);
        // 撤销自动跳题；若正处于「已作答、等待跳题」的瞬间，记下来待恢复时补跳
        if(st.autoNextTimer){
          clearTimeout(st.autoNextTimer);
          st.autoNextTimer = null;
          st.autoNextPending = true;
        }
      }else{
        st.paused = false;
        const pausedMs = Date.now() - st.pauseStart;
        st.pausedTotal += pausedMs;
        if(st.curStart) st.curStart += pausedMs;   // 当前题开始时间后移，使该题用时不含暂停
        if(btn){ btn.textContent = '暂停'; btn.classList.remove('paused'); }
        if(st.autoNextPending){
          // 恢复后补做被中断的跳题（否则会停在「已作答但无法继续作答」的中间态）
          st.autoNextPending = false;
          st.autoNextTimer = setTimeout(()=>next(), 400);
          return;
        }
        if(inp){ inp.disabled = false; }
        numpadKeys().forEach(k=>k.disabled = false);
        if(conf.lockExtra) conf.lockExtra(false);
        if(inp && !isTouchDevice()) inp.focus();
      }
    }

    function next(isFirst){
      if(st.paused) togglePause();   // 暂停中继续下一题：先恢复
      // 未提交的当前题（用户点了「跳过」）记为错误
      if(!isFirst && st.cur){
        st.questions.push(conf.skipRecord(st.cur, (Date.now() - st.curStart)/1000));
      }
      checkpointDraft();   // 未提交的当前题已记为错误，落盘
      clearTimeout(st.autoNextTimer);
      st.autoNextTimer = null;
      st.autoNextPending = false;
      const cur = conf.makeQuestion();
      st.cur = cur;
      if(!cur) return;     // 未选中范围等配置下无可出题
      st.curStart = Date.now();
      conf.renderQuestion(cur, st.questions.length + 1);
    }

    /* 一条作答记录入账并安排自动跳题（选择题直接点选项也走这里） */
    function commit(record, delay){
      st.questions.push(record);
      checkpointDraft();
      st.cur = null;
      st.autoNextTimer = setTimeout(next, delay);
    }

    function submit(){
      if(!st.cur || st.paused) return;
      const inp = pick(ui.input);
      const raw = inp ? inp.value.trim() : '';
      const usedSec = (Date.now() - st.curStart)/1000;
      const res = conf.evaluate(raw, st.cur, usedSec);
      if(!res) return;
      if(res.invalid){ flash('err', res.invalid); return; }
      flash(res.cls, res.text);
      if(conf.lockAfterAnswer) conf.lockAfterAnswer(st.cur, res);
      commit(conf.toRecord(st.cur, res.info, usedSec), res.delay);
    }

    function reveal(){
      if(!st.cur || st.paused) return;
      const usedSec = (Date.now() - st.curStart)/1000;
      const r = conf.reveal(st.cur, usedSec);
      flash('info', r.text);
      if(conf.lockAfterAnswer) conf.lockAfterAnswer(st.cur, null);
      // 查看答案后不自动跳题，等用户点「跳过」
      st.questions.push(r.record);
      checkpointDraft();
      st.cur = null;
    }

    function end(){
      if(st.questions.length===0 && st.cur && !confirm('本次还没有完成任何题目，确定结束练习？')) return;
      if(st.paused) togglePause();   // 暂停中结束：先恢复，保证 pausedTotal 结算完整
      // 当前未完成题不纳入统计（用户大概率未作答）
      st.cur = null;
      stop();
      showSummary(conf.summary());
    }

    function stop(){
      clearInterval(st.timer); st.timer = null;
      clearTimeout(st.autoNextTimer); st.autoNextTimer = null;
      st.autoNextPending = false;
    }

    return { state: st, start, next, submit, reveal, end, stop, togglePause, tick, commit, flash };
  }

  /* ---------- 固定题数练习公共计时 ----------
     三套固定题数练习（基本计算 / 平方数 / 百化分）的计时与暂停完全同构，
     这里只保留一份；各模块仍自己管理题目列表、批改与提交。
       state  必须含 start / timer / paused / pauseStart / pausedTotal
       ui     {time:'#fTotalTime', pause:'#fPause'}
       lock(paused)  暂停时锁定题目列表（输入框 / 选项按钮）
       onTick()      每次刷新时的额外动作（如更新「已答」计数） */
  function createFixedTimer(conf){
    const st = conf.state;
    const ui = conf.ui || {};
    const pick = sel => sel ? $(sel) : null;
    // 已用时（秒）：暂停时以 pauseStart 为基准，计时冻结
    function elapsedSec(){
      const now = st.paused ? st.pauseStart : Date.now();
      return Math.max(0, (now - st.start - st.pausedTotal)/1000);
    }
    function tick(){
      const el = pick(ui.time);
      if(el) el.textContent = fmtTime(elapsedSec());
      if(conf.onTick) conf.onTick();
    }
    function start(){
      st.paused = false;
      st.pauseStart = 0;
      st.pausedTotal = 0;
      clearInterval(st.timer);
      st.timer = setInterval(tick, 200);
      tick();
    }
    function togglePause(){
      const btn = pick(ui.pause);
      if(!st.paused){
        st.paused = true;
        st.pauseStart = Date.now();
        if(btn){ btn.textContent = '继续'; btn.classList.add('paused'); }
        if(conf.lock) conf.lock(true);
      }else{
        st.pausedTotal += Date.now() - st.pauseStart;
        st.paused = false;
        if(btn){ btn.textContent = '暂停'; btn.classList.remove('paused'); }
        if(conf.lock) conf.lock(false);
      }
      tick();
    }
    // 暂停中结束也要把已暂停的这段计入 pausedTotal，否则统计用时偏长
    function settlePause(){
      if(!st.paused) return;
      st.pausedTotal += Date.now() - st.pauseStart;
      st.paused = false;
      const btn = pick(ui.pause);
      if(btn){ btn.textContent = '暂停'; btn.classList.remove('paused'); }
    }
    function stop(){
      settlePause();
      clearInterval(st.timer);
      st.timer = null;
    }
    return { elapsedSec, start, tick, togglePause, stop };
  }

  /* ---------- 单题模式动态出题频率 ----------
     记忆仅限本次练习（内存权重表，练习开始时重置，结束即丢弃）：
     - 答对且用时 ≤ ADAPT_FAST_SEC 且零误差 → 权重减半，出现频率降低（视为熟练掌握）
     - 答对但超时，或判对但带误差（如百化分合格档）→ 权重不变
     - 答错 / 查看答案            → 权重翻倍；若翻倍后仍 <1 则置 1（曾做对已降频的题又答错 → 恢复正常频率重新来过）
     - 勾选“错题重复”时的重做作答（pending 补考）不参与频率调整，仅首次作答计入
     仅单题模式启用（单题才有逐题用时）；固定题数模式保持随机均匀。 */
  const ADAPT_FAST_SEC = 3;             // 快速答对阈值（秒），可按需调整
  const ADAPT_MIN = 0.125, ADAPT_MAX = 8;  // 权重夹取范围，防止某一题频率失控
  let adaptW = null;                    // 本次练习的权重表 { key: 权重 }，默认 1

  function adaptReset(){
    adaptW = {};
  }
  function adaptKey(val){
    return String(val);
  }
  function adaptWt(val){
    const w = adaptW[adaptKey(val)];
    return (typeof w === 'number' && w > 0) ? w : 1;
  }
  // 答题后更新权重；exact 表示是否零误差作答（有允许误差的练习中，判对但带误差不降频）
  function adaptUpdate(val, correct, usedSec, exact){
    const w = adaptWt(val);
    let nw;
    if(correct && usedSec <= ADAPT_FAST_SEC && exact) nw = w * 0.5;
    else if(correct) nw = w;
    else{
      nw = w * 2;
      if(nw < 1) nw = 1;   // 曾做对已降频的题又答错 → 恢复正常频率，重新来过
    }
    adaptW[adaptKey(val)] = Math.min(ADAPT_MAX, Math.max(ADAPT_MIN, nw));
  }
  // 加权随机选一：权重越大越可能被选中（返回池中元素）
  function adaptPick(pool){
    const ws = pool.map(adaptWt);
    const sum = ws.reduce((a,b)=>a+b, 0);
    let r = Math.random() * sum;
    for(let i=0;i<pool.length;i++){
      r -= ws[i];
      if(r <= 0) return pool[i];
    }
    return pool[pool.length-1];
  }

  /* ---------- 对外暴露 ---------- */
  Object.assign(GK, {
    adaptPick, adaptReset, adaptUpdate, createFixedTimer, createSingleDrill
  });
})(window.GK = window.GK || {});
