/* =========================================================
   平方数练习：配置 + 动态出题频率 + 单题 / 固定题数
   ========================================================= */
(function(GK){
  'use strict';

  // 依赖（由前面加载的模块暴露到 GK）
  const {
    $, $$, adaptPick, adaptReset, adaptUpdate, bindSegTo, createFixedTimer, createSingleDrill, go, isTouchDevice, nowStr, rand, recordLaunch, registerStarter, registerStop, scheduleDraft, showSummary, st, tuneInput
  } = GK;

  /* ---------- 平方数练习 ---------- */
  const RANGE_MAP = {
    '1-5':[1,2,3,4,5], '6-10':[6,7,8,9,10], '11-15':[11,12,13,14,15],
    '16-20':[16,17,18,19,20], '21-25':[21,22,23,24,25], '26-30':[26,27,28,29,30]
  };

  const squareCfg = { ranges:[], mode:'single', count:5, repeatWrong:false };

  function initSquareChips(){
    const wrap = $('#squareRange');
    if(!wrap) return;
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('.chip'); if(!b) return;
      const key = b.dataset.range;
      const nums = RANGE_MAP[key];
      if(!nums) return;
      const arr = squareCfg.ranges;
      // 检查是否已选中（交集）
      const hasAll = nums.every(n=>arr.includes(n));
      if(hasAll){
        nums.forEach(n=>{ const i=arr.indexOf(n); if(i>=0) arr.splice(i,1); });
        b.classList.remove('active');
      }else{
        nums.forEach(n=>{ if(!arr.includes(n)) arr.push(n); });
        arr.sort((x,y)=>x-y);
        b.classList.add('active');
      }
      updateSquareTip();
    });
  }

  function updateSquareTip(){
    const tip = $('#sqCfgTip');
    if(!tip) return;
    tip.textContent = squareCfg.ranges.length===0 ? '请至少选择一个数字范围' : '';
  }

  // 平方数配置 UI 与 squareCfg 状态保持一致
  function syncSquareCfgUI(){
    const rangeWrap = $('#squareRange');
    if(rangeWrap) $$('.chip',rangeWrap).forEach(c=>{
      c.classList.toggle('active', squareCfg.ranges.indexOf(+c.dataset.range) > -1);
    });
    bindSegTo('sqMode', squareCfg.mode);
    bindSegTo('sqCount', squareCfg.count);
    const rw = $('#sqRepeatWrongWrap'); if(rw) rw.style.display = squareCfg.mode==='single' ? '' : 'none';
    const fw = $('#sqFixedCountWrap'); if(fw) fw.style.display = squareCfg.mode==='fixed' ? '' : 'none';
    const cb = $('#sqRepeatWrong'); if(cb) cb.checked = squareCfg.repeatWrong;
  }
  // 「再来一次」：按快照还原配置并启动
  function applySquareCfg(config){
    squareCfg.ranges = config.ranges.slice();
    squareCfg.mode = config.mode || 'single';
    squareCfg.count = config.count || 5;
    squareCfg.repeatWrong = !!config.repeatWrong;
    syncSquareCfgUI();
    if(squareCfg.mode==='single') startSquareSingle();
    else startSquareFixed();
  }
  registerStarter('square', applySquareCfg);

  /* ---------- 平方数单题练习 ---------- */
  const sqSingle = {
    questions:[], cur:null, last:null, curStart:0, start:0,
    timer:null, autoNextTimer:null, autoNextPending:false,
    // 错题重复：记下待重做的错题数，达到“答错→重复，答对→换新题”
    pending:null,
    // 当前题是否为错题重做（重做不计入出题频率调整）
    isRepeat:false,
    paused:false, pauseStart:0, pausedTotal:0
  };

  const sqSingleDrill = createSingleDrill({
    state: sqSingle,
    view: 'square-single',
    ui: {
      pause:'#sqsPause', input:'#sqsInput', numpad:'#sqsNumpad', feedback:'#sqsFeedback',
      time:'#sqsTotalTime', count:'#sqsCount', acc:'#sqsAcc', avg:'#sqsAvg', cur:'#sqsCur'
    },
    onStart(){
      st.lastPracticeSource = 'square';
      recordLaunch('square', { ranges: squareCfg.ranges.slice(), mode: squareCfg.mode, count: squareCfg.count, repeatWrong: squareCfg.repeatWrong });
      adaptReset();   // 本次练习的记忆频率从零开始
      // 意外退出保护：每答一题把已完成题目写入草稿
      st.activePractice = ()=>({
        type:'平方数练习（单题）',
        time: nowStr(),
        launch: st.lastLaunch ? JSON.parse(JSON.stringify(st.lastLaunch)) : null,
        totalSec: ((sqSingle.paused ? sqSingle.pauseStart : Date.now()) - sqSingle.start - sqSingle.pausedTotal)/1000,
        questions: sqSingle.questions.map(q=>({
          expr: q.number+'²', answer:q.answer,
          displayAnswer:String(q.answer), errorPct:'-',
          user:String(q.user), correct:q.correct, usedSec:q.usedSec
        }))
      });
    },
    makeQuestion(){
      // 从选中范围中随机选数，避免连续重复；若非空待重做错题，则优先重做该题
      const pool = squareCfg.ranges;
      if(pool.length === 0) return null;
      let next;
      if(sqSingle.pending !== null){
        next = sqSingle.pending;       // 重做错题
        sqSingle.pending = null;       // 消费掉，答错时在判题处重新入队直至答对
        sqSingle.isRepeat = true;      // 错题重做不计入频率调整
      }else{
        sqSingle.isRepeat = false;
        if(pool.length > 1 && sqSingle.last !== null){
          // 加权随机：熟题出现频率低，错题出现频率高；同时剔除上一题避免连续重复
          next = adaptPick(pool.filter(n=>n !== sqSingle.last));
        }else{
          next = adaptPick(pool);
        }
      }
      sqSingle.last = next;   // 记录本题目（含错题重做），供下一题避免连续重复
      return next;
    },
    renderQuestion(n, index){
      $('#sqsIndex').textContent = `第 ${index} 题`;
      $('#sqsExpr').textContent = n + '² = ?';
      const inp = $('#sqsInput');
      inp.value = '';
      inp.disabled = false;
      tuneInput(inp, 'numeric');
      $$('.numpad-key', $('#sqsNumpad')).forEach(k=>k.disabled = false);
      $('#sqsFeedback').className = 'feedback';
      $('#sqsFeedback').textContent = '';
      if(!isTouchDevice()) inp.focus();
    },
    evaluate(raw, n, usedSec){
      if(raw==='') return { invalid:'请输入答案' };
      const user = parseInt(raw, 10);
      const ans = n * n;
      const correct = user === ans;
      // 平方数为整数精确匹配，判对即零误差
      if(!sqSingle.isRepeat) adaptUpdate(n, correct, usedSec, correct);
      if(!correct && squareCfg.repeatWrong) sqSingle.pending = n;   // 错题重做
      return {
        cls: correct ? 'ok' : 'err',
        text: correct ? '✓ 正确' : `✗ 错误，正确答案：${ans}`,
        delay: correct ? 300 : 1200,
        correct,
        info: { user, correct }
      };
    },
    toRecord(n, info, usedSec){
      return { number:n, answer:n*n, user:info.user, correct:info.correct, usedSec };
    },
    skipRecord(n, usedSec){
      return { number:n, answer:n*n, user:'', correct:false, usedSec };
    },
    reveal(n, usedSec){
      const ans = n * n;
      // 查看答案视同答错，提高频率；重做不计
      if(!sqSingle.isRepeat) adaptUpdate(n, false, usedSec, false);
      if(squareCfg.repeatWrong) sqSingle.pending = n;   // 查看答案视同答错，重做
      return {
        text: `答案：${ans}（点击"跳过"继续）`,
        record: { number:n, answer:ans, user:'(查看答案)', correct:false, usedSec }
      };
    },
    lockAfterAnswer(){
      $('#sqsInput').disabled = true;
      $$('.numpad-key', $('#sqsNumpad')).forEach(k=>k.disabled = true);
    },
    summary(){
      return {
        type:'平方数练习（单题）',
        questions: sqSingle.questions.map(q=>({
          expr: q.number+'²', answer: q.answer,
          displayAnswer: String(q.answer), errorPct: '-',
          userText: String(q.user), correct: q.correct, usedSec: q.usedSec
        })),
        totalSec: (Date.now() - sqSingle.start - sqSingle.pausedTotal)/1000   // 扣除暂停时长，统计纯练习用时
      };
    }
  });

  function startSquareSingle(){ sqSingleDrill.start(); }
  function toggleSqPause(){ sqSingleDrill.togglePause(); }
  function nextSqSingle(isFirst){ sqSingleDrill.next(isFirst); }
  function submitSqSingle(){ sqSingleDrill.submit(); }
  function revealSqSingle(){ sqSingleDrill.reveal(); }
  function endSqSingle(){ sqSingleDrill.end(); }
  function stopSqSingleTimers(){ sqSingleDrill.stop(); }

  /* ---------- 平方数固定题数练习 ---------- */
  const sqFixed = {
    questions:[], start:0, timer:null,
    paused:false, pauseStart:0, pausedTotal:0
  };

  function sqFixedDoneCount(){
    return sqFixed.questions.filter(q=>q.user!=='').length;
  }

  const sqFixedTimer = createFixedTimer({
    state: sqFixed,
    ui: { time:'#sqfTotalTime', pause:'#sqfPause' },
    onTick(){ $('#sqfDone').textContent = sqFixedDoneCount(); },
    lock(paused){ $$('.fi-input', $('#sqfList')).forEach(i=>i.disabled = paused); }
  });

  function startSquareFixed(){
    st.lastPracticeSource = 'square';
    recordLaunch('square', { ranges: squareCfg.ranges.slice(), mode: squareCfg.mode, count: squareCfg.count, repeatWrong: squareCfg.repeatWrong });
    // 意外退出保护：已填写的题按当前作答批改后写入草稿
    st.activePractice = ()=>{
      const totalSec = sqFixedTimer.elapsedSec();
      const per = sqFixed.questions.length ? totalSec/sqFixed.questions.length : 0;
      const answered = sqFixed.questions.filter(q=>q.user!=='' && !isNaN(parseInt(q.user,10)));
      return {
        type:'平方数练习（固定题数）',
        time: nowStr(),
        launch: st.lastLaunch ? JSON.parse(JSON.stringify(st.lastLaunch)) : null,
        totalSec,
        questions: answered.map(q=>{
          const u = parseInt(q.user, 10);
          return {
            expr:q.number+'²', answer:q.answer,
            displayAnswer:String(q.answer), errorPct:'-',
            user:q.user, correct:u===q.answer, usedSec:per
          };
        })
      };
    };
    const n = squareCfg.count;
    const pool = squareCfg.ranges;
    if(pool.length===0) return;
    sqFixed.questions = [];
    // 生成题目，避免相邻重复
    let last = null;
    for(let i=0;i<n;i++){
      let num;
      if(pool.length>1 && last !== null){
        const f = pool.filter(x=>x!==last);
        num = f[rand(0, f.length-1)];
      }else{
        num = pool[rand(0, pool.length-1)];
      }
      sqFixed.questions.push({ number:num, answer:num*num, user:'', correct:false, usedSec:0 });
      last = num;
    }
    sqFixed.start = Date.now();
    const list = $('#sqfList');
    list.innerHTML = '';
    sqFixed.questions.forEach((q,i)=>{
      const item = document.createElement('div');
      item.className = 'fixed-item';
      item.innerHTML = `
        <span class="fi-idx">${i+1}</span>
        <span class="fi-expr">${q.number}² <span class="eq">=</span></span>
        <input class="fi-input" inputmode="numeric" autocomplete="off" data-i="${i}" placeholder="?" />
      `;
      list.appendChild(item);
    });
    // 用 on* 赋值避免重复开始练习时监听器累积
    list.oninput = onSqFixedInput;
    $('#sqfCount').textContent = n;
    sqFixedTimer.start();
    go('square-fixed');
    const first = $('.fi-input', list);
    if(first) first.focus();
  }

  function onSqFixedInput(e){
    const inp = e.target.closest('.fi-input'); if(!inp) return;
    // 平方数为整数，只允许数字（否则 parseInt("12abc") 会被当作 12 判对）
    const clean = inp.value.replace(/\D/g, '');
    if(clean !== inp.value) inp.value = clean;
    const i = +inp.dataset.i;
    const item = inp.closest('.fixed-item');
    const val = inp.value.trim();
    sqFixed.questions[i].user = val;
    scheduleDraft();
    if(val===''){ item.classList.remove('done'); return; }
    item.classList.add('done');
    $('#sqfDone').textContent = sqFixedDoneCount();
  }

  function submitSqFixed(){
    const blank = sqFixed.questions.filter(q=> q.user==='').length;
    if(blank > 0 && !confirm(`还有 ${blank} 题未作答，确定直接结算？`)) return;
    const totalSec = sqFixedTimer.elapsedSec();   // 扣除暂停时长，统计纯练习用时
    const per = sqFixed.questions.length ? totalSec/sqFixed.questions.length : 0;
    sqFixed.questions.forEach(q=>{
      const u = q.user==='' ? null : parseInt(q.user,10);
      if(u !== null){
        q.correct = u === q.answer;
        q.userText = String(u);
      }else{
        q.correct = false;
        q.userText = '未填';
      }
      q.usedSec = per;
    });
    stopSqFixedTimers();
    showSummary({
      type:'平方数练习（固定题数）',
      questions: sqFixed.questions.map(q=>({
        expr: q.number+'²', answer: q.answer,
        displayAnswer: String(q.answer), errorPct: '-',
        userText: q.userText, correct: q.correct, usedSec: q.usedSec
      })),
      totalSec
    });
  }

  function toggleSqFixedPause(){ sqFixedTimer.togglePause(); }

  function stopSqFixedTimers(){
    sqFixedTimer.stop();
  }

  function stopAllSquareTimers(){
    stopSqSingleTimers();
    stopSqFixedTimers();
  }
  registerStop(stopAllSquareTimers);

  /* ---------- 对外暴露 ---------- */
  Object.assign(GK, {
    endSqSingle, initSquareChips, nextSqSingle, revealSqSingle, sqSingle, squareCfg, startSquareFixed, startSquareSingle, submitSqFixed, submitSqSingle, toggleSqFixedPause, toggleSqPause, updateSquareTip
  });
})(window.GK = window.GK || {});
