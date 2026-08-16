/* =========================================================
   公考资料分析计算练习工具
   纯前端实现：基本计算（单题/固定题数）+ 公式计算（UI 占位）
   ========================================================= */
(function(){
  'use strict';

  /* ---------- 通用工具 ---------- */
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const rand = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;
  const LS_KEY = 'gk_calc_records_v1';
  const isTouchDevice = ()=>'ontouchstart' in window || navigator.maxTouchPoints > 0;

  function fmtTime(sec){
    sec = Math.max(0,Math.floor(sec));
    const m = String(Math.floor(sec/60)).padStart(2,'0');
    const s = String(sec%60).padStart(2,'0');
    return m+':'+s;
  }
  function nowStr(){
    const d = new Date();
    const p = n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------- 视图切换 ---------- */
  const titles = {
    home:'公考资料分析计算练习',
    'basic-config':'基本计算',
    single:'单题练习',
    fixed:'固定题数练习',
    summary:'练习结算',
    history:'历史记录',
    'formula-menu':'公式计算',
    'formula-detail':'公式练习',
    'square-single':'平方数练习 · 单题',
    'square-fixed':'平方数练习 · 固定题数'
  };
  function go(view){
    $$('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
    $('#topbarTitle').textContent = titles[view]||'公考资料分析计算练习';
    // 仅在首页显示顶栏
    $('header.topbar').style.display = view==='home' ? '' : 'none';
    window.scrollTo({top:0,behavior:'instant'});
    // 视图进入钩子
    if(view==='history') renderHistory();
    if(view==='home') stopAllTimers();
  }

  /* ---------- 配置状态 ---------- */
  const cfg = {
    ops:[],             // 无默认
    aDigits:[],         // 无默认
    bDigits:[],         // 无默认
    mode:'single',
    answer:'fill',      // fill=填空, choice=选择
    count:5
  };

  function initChips(containerId, key){
    const wrap = $('#'+containerId);
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('.chip'); if(!b) return;
      const v = b.dataset.val;
      const arr = cfg[key];
      const i = arr.indexOf(v);
      if(i>=0){ arr.splice(i,1); b.classList.remove('active'); }
      else { arr.push(v); b.classList.add('active'); }
      // 排序保证稳定
      if(key==='aDigits'||key==='bDigits') arr.sort((x,y)=>+x-+y);
      updateCfgTip();
    });
  }
  function initSegs(containerId, key, isInt){
    const wrap = $('#'+containerId);
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('.seg'); if(!b) return;
      $$('.seg',wrap).forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      cfg[key] = isInt ? +b.dataset.val : b.dataset.val;
      if(key==='mode'){
        $('#fixedCountWrap').style.display = cfg.mode==='fixed' ? '' : 'none';
      }
    });
  }

  function updateCfgTip(){
    const tip = $('#cfgTip');
    if(!tip) return;
    const problems = [];
    if(cfg.ops.length===0) problems.push('请至少选择一种运算');
    if(cfg.aDigits.length===0) problems.push('请选择第一个数位数');
    if(cfg.bDigits.length===0) problems.push('请选择第二个数位数');
    tip.textContent = problems[0]||'';
  }

  /* ---------- 位数范围 ---------- */
  function digitMin(d){ return d===1 ? 1 : Math.pow(10,d-1); }
  function digitMax(d){ return Math.pow(10,d)-1; }

  /* ---------- 题目生成 ---------- */
  const OP_SYMBOL = {add:'+',sub:'−',mul:'×',div:'÷'};

  function genNumber(digits, minOverride){
    const min = minOverride !== undefined ? minOverride : digitMin(digits);
    const max = digitMax(digits);
    return rand(min, max);
  }

  /* ---------- 选择题项生成 ---------- */
  /* 数值的小数位数（用于统一各选项的显示精度） */
  function decimalsOf(n){
    const s = String(n);
    return s.includes('.') ? s.split('.')[1].length : 0;
  }
  /* 按固定小数位四舍五入 */
  function roundTo(n, dec){
    const f = Math.pow(10, dec);
    return Math.round(n*f)/f;
  }
  /* 比例偏差生成干扰项（用于两位数及以上答案）
     lo/hi：最小/最大比例偏差；minAbs：可选的最小绝对间距；
     opts：累积选项数组（含正确项）。 */
  function genRatio(correct, dec, lo, hi, minAbs, opts){
    let guard = 0;
    while(opts.length < 4 && guard < 400){
      guard++;
      const sign = Math.random() < 0.5 ? -1 : 1;
      const bias = (lo + Math.random()*(hi-lo)) * sign;
      const w = roundTo(correct * (1 + bias), dec);
      if(!isFinite(w) || Math.abs(w) < 1e-9) continue;
      if(opts.some(o=>Math.abs(o - w) < 1e-9)) continue;   // 去重
      const rel = Math.abs(w - correct) / Math.abs(correct) * 100;
      if(rel < lo*100) continue;                 // 不过于接近正确项
      if(minAbs != null && Math.abs(w - correct) < minAbs) continue;  // 绝对最小间距
      if(Math.abs(w) > Math.abs(correct) * 5) continue;   // 同数量级约束
      opts.push(w);
    }
    // 兜底：若随机未能凑满 4 个，用递增偏差补足
    guard = 0;
    while(opts.length < 4){
      const sign = guard % 2 ? 1 : -1;
      const bias = (lo + 0.01 + guard*0.02) * sign;
      const w = roundTo(correct * (1 + bias), dec);
      if(minAbs != null && Math.abs(w - correct) < minAbs){ guard++; continue; }
      if(!opts.some(o=>Math.abs(o - w) < 1e-9)) opts.push(w);
      guard++;
    }
  }

  /* 生成 4 个选项：
     正确项 = 精确答案四舍五入保留最多 2 位小数；
     干扰项与正确项采用相同的小数位数，保证格式完全一致。
     干扰项生成按答案量级自适应（最小偏差 3%）：
       |正确项| < 10   → 绝对偏移 ±1,±2,±3…（个位数合理误差即相邻整数）
       10~99           → 比例偏差 3%~10% + 绝对最小间距 1
       ≥100            → 比例偏差 3%~10% */
  function genOptions(q){
    const dec = Math.min(2, decimalsOf(q.answer));   // 正确项最多保留 2 位小数
    const correct = roundTo(q.answer, dec);          // 正确项
    const opts = [correct];

    // 正确答案为 0（或极接近 0）的退化情况：用小的整数值作干扰项
    if(Math.abs(correct) < 1e-9){
      const pool = [1,-1,2,-2,3,-3];
      for(let i=0; opts.length<4 && i<pool.length; i++){
        if(!opts.includes(pool[i])) opts.push(pool[i]);
      }
    }else if(Math.abs(correct) < 10){
      // 个位数：绝对偏移 ±1,±2,±3…
      const offsets = [1,-1,2,-2,3,-3,4,-4,5,-5,10,-10];
      for(const k of offsets){
        if(opts.length >= 4) break;
        const w = roundTo(correct + k, dec);
        if(opts.some(o=>Math.abs(o - w) < 1e-9)) continue;
        opts.push(w);
      }
      // 兜底：递增偏移补足
      let guard = 1;
      while(opts.length < 4){
        const w = roundTo(correct + guard, dec);
        if(!opts.some(o=>Math.abs(o - w) < 1e-9)) opts.push(w);
        guard++;
      }
    }else if(Math.abs(correct) < 100){
      // 两位数：比例偏差 3%~10%，保证至少相差 1
      genRatio(correct, dec, 0.03, 0.10, 1, opts);
    }else{
      // 三位数及以上：比例偏差 3%~10%
      genRatio(correct, dec, 0.03, 0.10, null, opts);
    }
    // 打乱顺序
    for(let i=opts.length-1;i>0;i--){
      const j = rand(0, i);
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return { opts, correct, dec };
  }

  function genQuestion(){
    const op = cfg.ops[rand(0,cfg.ops.length-1)];
    const da = +cfg.aDigits[rand(0,cfg.aDigits.length-1)];
    const db = +cfg.bDigits[rand(0,cfg.bDigits.length-1)];
    let a, b, answer, expr;

    if(op==='add'){
      a = genNumber(da); b = genNumber(db);
      answer = a + b;
    } else if(op==='sub'){
      a = genNumber(da); b = genNumber(db);
      answer = a - b;
    } else if(op==='mul'){
      a = genNumber(da); b = genNumber(db, db===1?2:undefined);
      answer = a * b;
    } else { // div
      // 正常除法，不强制整除，答案可以是小数
      a = genNumber(da);
      b = genNumber(db, db===1?2:undefined);
      answer = a / b;
    }
    expr = `${a} ${OP_SYMBOL[op]} ${b}`;
    const g = genOptions({a, b, op, answer});
    const correctIndex = g.opts.indexOf(g.correct);
    return { op,a,b,answer,expr, dec:g.dec,
      options: g.opts.map(v=>({ val:v, text:v.toFixed(g.dec) })),
      correctIndex };
  }

  /* ---------- 单题练习 ---------- */
  const single = {
    questions:[],      // 已完成题目记录 {expr,answer,user,correct,usedSec}
    cur:null,          // 当前题目对象
    curStart:0,        // 当前题开始时间戳
    start:0,           // 练习开始时间戳
    timer:null,
    autoNextTimer:null,
    revealing:false,   // 是否已查看答案（本题不能再答）
    paused:false,      // 是否暂停中
    pauseStart:0,      // 暂停开始时间戳
    pausedTotal:0      // 累计暂停毫秒数
  };

  function startSingle(){
    lastPracticeSource = 'basic';
    single.questions = [];
    single.start = Date.now();
    single.timer = setInterval(tickSingle,200);
    go('single');
    // 先切视图再生成题目，确保输入框可见后 focus 才生效
    nextSingle(true);
  }

  function tickSingle(){
    // 暂停时使用 pauseStart 作为参考时间，使计时冻结
    const now = single.paused ? single.pauseStart : Date.now();
    const elapsed = (now - single.start - single.pausedTotal)/1000;
    $('#sTotalTime').textContent = fmtTime(elapsed);
    const n = single.questions.length;
    $('#sCount').textContent = n;
    const correct = single.questions.filter(q=>q.correct).length;
    const acc = n? Math.round(correct/n*100):0;
    $('#sAcc').textContent = acc+'%';
    $('#sAvg').textContent = (n? (elapsed/n).toFixed(1):'0.0')+'s';
    if(single.curStart){
      const cur = (now - single.curStart - single.pausedTotal)/1000;
      $('#sCur').textContent = Math.max(0,cur).toFixed(1)+'s';
    }
  }

  function togglePause(){
    single.paused = !single.paused;
    const btn = $('#singlePause');
    const inp = $('#singleInput');
    const numpadKeys = $$('.numpad-key');
    const choiceBtns = $$('.choice-btn', $('#singleChoice'));
    if(single.paused){
      single.pauseStart = Date.now();
      btn.textContent = '继续';
      btn.classList.add('paused');
      inp.disabled = true;
      numpadKeys.forEach(k=>k.disabled = true);
      choiceBtns.forEach(b=>b.disabled = true);
      // 清除自动跳转（暂停时不应跳题）
      clearTimeout(single.autoNextTimer);
    } else {
      single.pausedTotal += Date.now() - single.pauseStart;
      btn.textContent = '暂停';
      btn.classList.remove('paused');
      inp.disabled = false;
      inp.readOnly = isTouchDevice();
      numpadKeys.forEach(k=>k.disabled = false);
      choiceBtns.forEach(b=>b.disabled = false);
      if(!isTouchDevice()) inp.focus();
    }
  }

  function nextSingle(isFirst){
    // 如果暂停中，恢复
    if(single.paused) togglePause();
    // 把未提交的当前题（用户跳过）记为错误
    if(!isFirst && single.cur){
      single.questions.push({
        expr: single.cur.expr, answer: single.cur.answer,
        displayAnswer: formatAnswer(single.cur.answer), errorPct: '-',
        user: '', correct: false,
        usedSec: (Date.now()-single.curStart)/1000
      });
    }
    clearTimeout(single.autoNextTimer);
    single.revealing = false;
    single.cur = genQuestion();
    single.curStart = Date.now();
    $('#singleIndex').textContent = `第 ${single.questions.length+1} 题`;
    $('#singleExpr').textContent = single.cur.expr + ' = ?';
    const isChoice = cfg.answer === 'choice';
    $('#singleChoice').style.display = isChoice ? '' : 'none';
    $('#singleChoiceHint').style.display = isChoice ? '' : 'none';
    $('#singleAnswerRow').style.display = isChoice ? 'none' : '';
    $('#numpad').style.display = isChoice ? 'none' : '';
    if(isChoice){
      renderSingleChoice();
    }else{
      $('#singleInput').value = '';
      $('#singleInput').disabled = false;
      $('#singleInput').readOnly = isTouchDevice();
      $$('.numpad-key').forEach(k=>k.disabled = false);
    }
    $('#singleFeedback').className = 'feedback';
    $('#singleFeedback').textContent = '';
    if(!isChoice && !isTouchDevice()) $('#singleInput').focus();
  }

  /* 渲染单题选择题（十字排布：上/左/右/下） */
  function renderSingleChoice(){
    const wrap = $('#singleChoice');
    wrap.innerHTML = '';
    const dirs = ['top','left','right','bottom'];
    const arrows = {top:'↑', left:'←', right:'→', bottom:'↓'};
    single.cur.options.forEach((o,i)=>{
      const b = document.createElement('button');
      b.className = 'choice-btn choice-btn--' + dirs[i];
      b.dataset.index = i;
      b.textContent = `${arrows[dirs[i]]} ${o.text}`;
      b.addEventListener('click', ()=>chooseSingle(i));
      wrap.appendChild(b);
    });
  }

  /* 选择题作答 */
  function chooseSingle(i){
    if(!single.cur || single.paused) return;
    if(single.revealing){ nextSingle(); return; }
    const q = single.cur;
    const correct = i === q.correctIndex;
    const usedSec = (Date.now()-single.curStart)/1000;
    const btns = $$('.choice-btn', $('#singleChoice'));
    btns.forEach(b=>b.disabled = true);
    btns[i].classList.add('selected');
    const correctBtn = btns[q.correctIndex];
    if(correct){
      $('#singleFeedback').className = 'feedback ok';
      $('#singleFeedback').textContent = '✓ 正确';
      correctBtn.classList.add('ok');
    }else{
      $('#singleFeedback').className = 'feedback err';
      $('#singleFeedback').textContent = `✗ 错误，正确答案：${q.options[q.correctIndex].text}`;
      btns[i].classList.add('err');
      correctBtn.classList.add('ok');
    }
    single.questions.push({
      expr:q.expr, answer:q.answer,
      displayAnswer: q.options[q.correctIndex].text, errorPct:'-',
      userText: q.options[i].text, user: q.options[i].text, correct,
      usedSec
    });
    single.cur = null;
    single.autoNextTimer = setTimeout(()=>nextSingle(), correct?700:1200);
  }

  function submitSingle(){
    if(!single.cur || single.paused) return;
    if(single.revealing){ nextSingle(); return; }
    const raw = $('#singleInput').value.trim();
    if(raw===''){
      flashFeedback('err','请输入答案');
      return;
    }
    const user = parseNum(raw);
    const result = checkAnswer(user, single.cur);
    const isExact = (result.errorPct === '-');
    const disableNumpad = ()=>$$('.numpad-key').forEach(k=>k.disabled = true);
    if(result.correct){
      const msg = isExact
        ? '✓ 正确'
        : `✓ 正确（答案：${result.displayAnswer}，误差 ${result.errorPct}）`;
      $('#singleFeedback').className = 'feedback ok';
      $('#singleFeedback').textContent = msg;
      $('#singleInput').disabled = true;
      disableNumpad();
      single.questions.push({
        expr: single.cur.expr, answer: single.cur.answer,
        displayAnswer: result.displayAnswer, errorPct: result.errorPct,
        user, correct: true,
        usedSec: (Date.now()-single.curStart)/1000
      });
      single.cur = null;
      single.autoNextTimer = setTimeout(()=>nextSingle(), 700);
    } else {
      const msg = isExact
        ? `✗ 错误，正确答案：${result.displayAnswer}`
        : `✗ 错误，正确答案：${result.displayAnswer}，误差 ${result.errorPct}`;
      $('#singleFeedback').className = 'feedback err';
      $('#singleFeedback').textContent = msg;
      single.questions.push({
        expr: single.cur.expr, answer: single.cur.answer,
        displayAnswer: result.displayAnswer, errorPct: result.errorPct,
        user, correct: false,
        usedSec: (Date.now()-single.curStart)/1000
      });
      single.cur = null;
      $('#singleInput').disabled = true;
      disableNumpad();
      single.autoNextTimer = setTimeout(()=>nextSingle(), 1200);
    }
  }

  function revealSingle(){
    if(!single.cur || single.paused) return;
    single.revealing = true;
    const display = formatAnswer(single.cur.answer);
    $('#singleFeedback').className = 'feedback info';
    $('#singleFeedback').textContent = `答案：${display}（点击"跳过"继续）`;
    if(cfg.answer === 'choice'){
      $$('.choice-btn', $('#singleChoice')).forEach(b=>b.disabled = true);
    }else{
      $('#singleInput').disabled = true;
      $$('.numpad-key').forEach(k=>k.disabled = true);
    }
    // 查看答案计为错误
    single.questions.push({
      expr: single.cur.expr, answer: single.cur.answer,
      displayAnswer: display, errorPct: '-',
      userText: '(查看答案)', user: '', correct: false,
      usedSec: (Date.now()-single.curStart)/1000
    });
    single.cur = null;
  }

  function endSingle(){
    // 如果暂停中，恢复
    if(single.paused) togglePause();
    // 当前未完成题不纳入统计（用户大概率未作答）
    single.cur = null;
    stopSingleTimers();
    showSummary({
      type:'单题练习',
      questions: single.questions,
      totalSec: (Date.now()-single.start)/1000,
      answerMode: cfg.answer
    });
  }

  function stopSingleTimers(){
    clearInterval(single.timer); single.timer=null;
    clearTimeout(single.autoNextTimer); single.autoNextTimer=null;
  }

  function flashFeedback(type,msg){
    $('#singleFeedback').className = 'feedback '+type;
    $('#singleFeedback').textContent = msg;
  }

  function parseNum(s){
    s = s.replace(/[,，\s]/g,'');
    if(s.includes('.')) return parseFloat(s);
    return parseInt(s,10);
  }

  /* ---------- 输入限定（只允许数字、小数点、负号） ---------- */
  function restrictNumericInput(e){
    const inp = e.target;
    let v = inp.value;
    // 过滤非法字符：只保留数字、小数点、负号
    v = v.replace(/[^0-9.\-]/g, '');
    // 负号只能在开头，去掉多余的负号
    const neg = v.indexOf('-');
    if(neg > 0) v = v.replace(/-/g, '');
    if(neg === 0) v = '-' + v.replace(/-/g, '');
    // 最多一个小数点
    const parts = v.split('.');
    if(parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
    inp.value = v;
  }

  /* ---------- 有效数字格式化 ---------- */
  function toSigDigits(num, n){
    if(num === 0) return '0';
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    const log10 = Math.floor(Math.log10(abs));
    const factor = Math.pow(10, log10 - n + 1);
    const rounded = Math.round(abs / factor) * factor;
    // 避免科学记数法
    if(Number.isInteger(rounded) && rounded < 1e15) return sign + rounded;
    const decimals = Math.max(0, n - log10 - 1);
    return sign + rounded.toFixed(decimals);
  }
  function formatAnswer(num){ return toSigDigits(num, 4); }

  /* ---------- 容差判断 ---------- */
  function checkAnswer(user, q){
    const exact = q.answer;
    // 加、减：精确匹配
    if(q.op === 'add' || q.op === 'sub'){
      return { correct: user === exact, displayAnswer: String(exact), errorPct: '-' };
    }
    // 乘、除：2% 容差
    if(exact === 0) return { correct: user === 0, displayAnswer: '0', errorPct: '0%' };
    const diff = Math.abs(user - exact);
    const pct = diff / Math.abs(exact) * 100;
    const correct = pct <= 2;
    const displayAnswer = toSigDigits(exact, 4);
    // 误差百分比保留两位有效数字
    const errorPct = pct < 0.01 ? '<0.01%' : toSigDigits(pct, 2) + '%';
    return { correct, displayAnswer, errorPct };
  }

  /* ---------- 固定题数练习 ---------- */
  const fixed = {
    questions:[],     // {expr,answer,user,correct,usedSec,start}
    start:0,
    timer:null
  };

  function fixedDoneCount(){
    return fixed.questions.filter(q=> q.user!==undefined && q.user!=='').length;
  }

  function startFixed(){
    lastPracticeSource = 'basic';
    const n = cfg.count;
    const isChoice = cfg.answer === 'choice';
    fixed.questions = [];
    for(let i=0;i<n;i++){
      const q = genQuestion();
      fixed.questions.push({ ...q, expr:q.expr, user:'', correct:false, usedSec:0 });
    }
    fixed.start = Date.now();
    // 渲染列表
    const list = $('#fixedList');
    list.innerHTML = '';
    fixed.questions.forEach((q,i)=>{
      const item = document.createElement('div');
      item.className = 'fixed-item';
      if(isChoice){
        item.innerHTML = `
          <span class="fi-idx">${i+1}</span>
          <span class="fi-expr">${q.expr} <span class="eq">=</span></span>
          <div class="fi-options">
            ${q.options.map((o,oi)=>`<button class="fi-opt" data-i="${i}" data-oi="${oi}">${o.text}</button>`).join('')}
          </div>
        `;
      }else{
        item.innerHTML = `
          <span class="fi-idx">${i+1}</span>
          <span class="fi-expr">${q.expr} <span class="eq">=</span></span>
          <input class="fi-input" inputmode="numeric" autocomplete="off" data-i="${i}" placeholder="?" />
        `;
      }
      list.appendChild(item);
    });
    list.addEventListener('input', onFixedInput);
    list.addEventListener('click', onFixedOpt);
    $('#fCount').textContent = n;
    $('#fixedChoiceHint').style.display = isChoice ? '' : 'none';
    fixed.timer = setInterval(tickFixed,200);
    go('fixed');
    // 自动聚焦第一题（填空模式）
    if(!isChoice){
      const first = $('.fi-input',list);
      if(first) first.focus();
    }
  }

  function onFixedOpt(e){
    const b = e.target.closest('.fi-opt'); if(!b) return;
    const i = +b.dataset.i;
    const oi = +b.dataset.oi;
    fixed.questions[i].user = oi;
    const item = b.closest('.fixed-item');
    $$('.fi-opt', item).forEach(x=>x.classList.remove('selected'));
    b.classList.add('selected');
    item.classList.add('done');
    $('#fDone').textContent = fixedDoneCount();
  }

  function onFixedInput(e){
    restrictNumericInput(e);
    const inp = e.target.closest('.fi-input'); if(!inp) return;
    const i = +inp.dataset.i;
    const item = inp.closest('.fixed-item');
    const val = inp.value.trim();
    fixed.questions[i].user = val;
    if(val===''){ item.classList.remove('done'); return; }
    item.classList.add('done');
    $('#fDone').textContent = fixedDoneCount();
  }

  function tickFixed(){
    const total = (Date.now()-fixed.start)/1000;
    $('#fTotalTime').textContent = fmtTime(total);
    $('#fDone').textContent = fixedDoneCount();
  }

  function submitFixed(){
    const totalSec = (Date.now()-fixed.start)/1000;
    const per = fixed.questions.length ? totalSec/fixed.questions.length : 0;
    const isChoice = cfg.answer === 'choice';
    fixed.questions.forEach(q=>{
      if(isChoice){
        if(q.user === undefined || q.user === ''){
          q.correct = false;
          q.displayAnswer = q.options[q.correctIndex].text;
          q.errorPct = '-';
          q.userText = '未选';
        }else{
          const oi = q.user;
          q.correct = oi === q.correctIndex;
          q.displayAnswer = q.options[q.correctIndex].text;
          q.errorPct = '-';
          q.userText = q.options[oi].text;
        }
      }else{
        const u = q.user==='' ? null : parseNum(q.user);
        if(u !== null){
          const result = checkAnswer(u, q);
          q.correct = result.correct;
          q.displayAnswer = result.displayAnswer;
          q.errorPct = result.errorPct;
        } else {
          q.correct = false;
          q.displayAnswer = formatAnswer(q.answer);
          q.errorPct = '-';
        }
        q.userText = q.user==='' ? '未填' : q.user;
      }
      q.usedSec = per;
    });
    stopFixedTimers();
    showSummary({
      type:`固定题数（${fixed.questions.length}题）`,
      questions: fixed.questions,
      totalSec,
      answerMode: cfg.answer
    });
  }

  function abortFixed(){
    stopFixedTimers();
    go('home');
  }

  function stopFixedTimers(){
    clearInterval(fixed.timer); fixed.timer=null;
  }

  function stopAllTimers(){
    stopSingleTimers();
    stopFixedTimers();
    stopAllSquareTimers();
  }

  /* ---------- 结算页 ---------- */
  let lastSummary = null;
  let lastConfigSnapshot = null;
  let lastPracticeSource = 'basic';

  function showSummary(data, persist=true){
    lastSummary = data;
    if(persist){
      lastConfigSnapshot = JSON.parse(JSON.stringify(cfg));
    }
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

    const detail = $('#sumDetail');
    const isFixed = data.type.includes('固定题数');
    detail.className = 'detail-list' + (isFixed ? ' no-time' : '');
    detail.innerHTML = '';
    const isFill = data.answerMode !== 'choice';   // 填空模式（含平方数练习）
    qs.forEach((q,i)=>{
      const ok = q.correct;
      const row = document.createElement('div');
      row.className = 'detail-item ' + (ok?'ok':'err') + (isFixed?' no-time':'');
      const da = q.displayAnswer || String(q.answer);
      const ep = q.errorPct || '-';
      const tm = (!isFixed && q.usedSec !== undefined) ? q.usedSec.toFixed(1)+'s' : '';
      const userVal = q.userText!==undefined ? q.userText : (q.user!==undefined ? q.user : '');
      row.innerHTML = `
        <span class="di-idx">${i+1}</span>
        <span class="di-q">${q.expr} = ${da}</span>
        <span class="di-a ${ok?'ok':'err'}">${ok ? (isFill ? '✔ ' + userVal : '✔') : ('✘ ' + userVal)}</span>
        <span class="di-t">${ep}</span>
        ${isFixed ? '' : `<span class="di-time">${tm}</span>`}
      `;
      detail.appendChild(row);
    });

    // 保存记录（历史回看不重复保存）
    if(persist){
      saveRecord({
        type: data.type,
        time: nowStr(),
        count: qs.length,
        correct,
        acc,
        totalSec: total,
        avgSec: avg,
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

  /* ---------- 历史记录 ---------- */
  function loadRecords(){
    try{ return JSON.parse(localStorage.getItem(LS_KEY))||[]; }
    catch(e){ return []; }
  }
  function saveRecord(r){
    const list = loadRecords();
    list.unshift(r);
    while(list.length>3) list.pop();
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }
  function renderHistory(){
    const list = loadRecords();
    const wrap = $('#historyList');
    if(list.length===0){
      wrap.innerHTML = '<div class="history-empty">暂无练习记录</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach((r,i)=>{
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="hi-top">
          <span class="hi-type">${r.type}</span>
          <span class="hi-time">${r.time}</span>
        </div>
        <div class="hi-stats">
          <span>题数 <b>${r.count}</b></span>
          <span>正确率 <b>${r.acc}%</b></span>
          <span>总时长 <b>${fmtTime(r.totalSec)}</b></span>
          <span>均/题 <b>${r.avgSec.toFixed(1)}s</b></span>
        </div>
        <div class="hi-stats" style="margin-top:4px;">
          <span>正确 <b style="color:var(--ok)">${r.correct}</b></span>
          <span>错误 <b style="color:var(--err)">${r.count-r.correct}</b></span>
        </div>
      `;
      el.addEventListener('click', ()=>showHistoryDetail(r));
      wrap.appendChild(el);
    });
  }
  function showHistoryDetail(r){
    showSummary({
      type: r.type + '（历史回看）',
      questions: r.questions.map(q=>({
        expr:q.expr, answer:q.answer,
        displayAnswer: q.displayAnswer || String(q.answer),
        errorPct: q.errorPct || '-',
        userText: q.user, correct:q.correct, usedSec:q.usedSec, user:q.user
      })),
      totalSec: r.totalSec
    }, false);
  }

  /* ---------- 公式计算（KaTeX 数学公式渲染） ---------- */
  const FORMULA_INFO = {
    base:{
      title:'求基期',
      formula:'\\text{基期量} = \\dfrac{\\text{现期量}}{1 + \\text{增长率}}',
      desc:'已知现期量和增长率，求基期量'
    },
    growth:{
      title:'求增长量',
      formula:'\\text{增长量} = \\dfrac{\\text{现期量} \\times \\text{增长率}}{1 + \\text{增长率}}',
      desc:'已知现期量和增长率，求增长量'
    },
    percent:{
      title:'百化分练习',
      formula:'\\dfrac{1}{2}=50\\% \\quad \\dfrac{1}{3}\\approx 33.3\\% \\quad \\dfrac{1}{4}=25\\% \\quad \\dfrac{1}{8}=12.5\\%',
      desc:'常见百分数与分数的互化'
    },
    square:{
      title:'平方数练习',
      formula:'1² ~ 30² 速算记忆与练习',
      desc:'1 到 30 的平方数快速反应'
    },
    rate:{
      title:'求增长率',
      formula:'\\text{增长率} = \\dfrac{\\text{增长量}}{\\text{基期量}}',
      desc:'已知增长量和基期量，求增长率'
    }
  };
  function openFormula(key){
    const info = FORMULA_INFO[key];
    $('#fdTitle').textContent = info.title;
    const el = $('#fdFormula');
    // 平方数显示 1~30 平方数表
    if(key === 'square'){
      const cells = [];
      for(let i=1;i<=30;i++){
        cells.push(`<span>${i}²=${i*i}</span>`);
      }
      el.innerHTML = '<div class="square-table">'+cells.join('')+'</div>';
    }else{
      // 其他公式用 KaTeX 渲染
      if(window.katex){
        try{
          katex.render(info.formula, el, {displayMode:true, throwOnError:false});
        }catch(e){
          el.textContent = info.formula;
        }
      }else{
        el.textContent = info.formula;
      }
    }
    // 更新描述文字
    const desc = $('#fdDesc');
    if(desc) desc.textContent = info.desc || '';
    // 平方数显示配置区，其他公式显示占位
    const sqCfg = $('#fdSquareConfig');
    const ph = $('#fdPlaceholder');
    if(key === 'square'){
      sqCfg.style.display = '';
      ph.style.display = 'none';
      // 重置平方数配置提示
      const tip = $('#sqCfgTip');
      if(tip) tip.textContent = '';
    }else{
      sqCfg.style.display = 'none';
      ph.style.display = '';
    }
    go('formula-detail');
  }

  /* ---------- 平方数练习 ---------- */
  const RANGE_MAP = {
    '1-5':[1,2,3,4,5], '6-10':[6,7,8,9,10], '11-15':[11,12,13,14,15],
    '16-20':[16,17,18,19,20], '21-25':[21,22,23,24,25], '26-30':[26,27,28,29,30]
  };

  const squareCfg = { ranges:[], mode:'single', count:5 };

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

  /* ---------- 平方数单题练习 ---------- */
  const sqSingle = {
    questions:[], cur:null, curStart:0, start:0,
    timer:null, autoNextTimer:null,
    revealing:false, paused:false, pauseStart:0, pausedTotal:0
  };

  function startSquareSingle(){
    lastPracticeSource = 'square';
    sqSingle.questions = [];
    sqSingle.start = Date.now();
    sqSingle.timer = setInterval(tickSqSingle, 200);
    go('square-single');
    nextSqSingle(true);
  }

  function tickSqSingle(){
    const now = sqSingle.paused ? sqSingle.pauseStart : Date.now();
    const elapsed = (now - sqSingle.start - sqSingle.pausedTotal)/1000;
    $('#sqsTotalTime').textContent = fmtTime(elapsed);
    const n = sqSingle.questions.length;
    $('#sqsCount').textContent = n;
    const correct = sqSingle.questions.filter(q=>q.correct).length;
    const acc = n ? Math.round(correct/n*100) : 0;
    $('#sqsAcc').textContent = acc+'%';
    $('#sqsAvg').textContent = (n ? (elapsed/n).toFixed(1) : '0.0')+'s';
    if(sqSingle.curStart){
      const cur = (now - sqSingle.curStart - sqSingle.pausedTotal)/1000;
      $('#sqsCur').textContent = Math.max(0,cur).toFixed(1)+'s';
    }
  }

  function toggleSqPause(){
    sqSingle.paused = !sqSingle.paused;
    const btn = $('#sqsPause');
    const inp = $('#sqsInput');
    const numpadKeys = $$('.numpad-key', $('#sqsNumpad'));
    if(sqSingle.paused){
      sqSingle.pauseStart = Date.now();
      btn.textContent = '继续';
      btn.classList.add('paused');
      inp.disabled = true;
      numpadKeys.forEach(k=>k.disabled = true);
      clearTimeout(sqSingle.autoNextTimer);
    }else{
      sqSingle.pausedTotal += Date.now() - sqSingle.pauseStart;
      btn.textContent = '暂停';
      btn.classList.remove('paused');
      inp.disabled = false;
      inp.readOnly = isTouchDevice();
      numpadKeys.forEach(k=>k.disabled = false);
      if(!isTouchDevice()) inp.focus();
    }
  }

  function nextSqSingle(isFirst){
    if(sqSingle.paused) toggleSqPause();
    // 未提交的当前题记为错误
    if(!isFirst && sqSingle.cur){
      sqSingle.questions.push({
        number: sqSingle.cur,
        answer: sqSingle.cur * sqSingle.cur,
        user: '', correct: false,
        usedSec: (Date.now()-sqSingle.curStart)/1000
      });
    }
    clearTimeout(sqSingle.autoNextTimer);
    sqSingle.revealing = false;
    // 从选中范围中随机选数，避免连续重复
    const pool = squareCfg.ranges;
    if(pool.length===0) return;
    let next;
    if(pool.length>1 && sqSingle.cur !== null){
      const filtered = pool.filter(n=>n!==sqSingle.cur);
      next = filtered[rand(0, filtered.length-1)];
    }else{
      next = pool[rand(0, pool.length-1)];
    }
    sqSingle.cur = next;
    sqSingle.curStart = Date.now();
    $('#sqsIndex').textContent = `第 ${sqSingle.questions.length+1} 题`;
    $('#sqsExpr').textContent = next + '² = ?';
    $('#sqsInput').value = '';
    $('#sqsInput').disabled = false;
    $('#sqsInput').readOnly = isTouchDevice();
    $$('.numpad-key', $('#sqsNumpad')).forEach(k=>k.disabled = false);
    $('#sqsFeedback').className = 'feedback';
    $('#sqsFeedback').textContent = '';
    if(!isTouchDevice()) $('#sqsInput').focus();
  }

  function submitSqSingle(){
    if(!sqSingle.cur || sqSingle.paused) return;
    if(sqSingle.revealing){ nextSqSingle(); return; }
    const raw = $('#sqsInput').value.trim();
    if(raw===''){ flashSqFeedback('err','请输入答案'); return; }
    const user = parseInt(raw, 10);
    const correct = user === sqSingle.cur * sqSingle.cur;
    const usedSec = (Date.now()-sqSingle.curStart)/1000;
    if(correct){
      $('#sqsFeedback').className = 'feedback ok';
      $('#sqsFeedback').textContent = '✓ 正确';
      sqSingle.questions.push({
        number: sqSingle.cur, answer: sqSingle.cur*sqSingle.cur,
        user, correct: true, usedSec
      });
      sqSingle.cur = null;
      $('#sqsInput').disabled = true;
      $$('.numpad-key', $('#sqsNumpad')).forEach(k=>k.disabled = true);
      sqSingle.autoNextTimer = setTimeout(()=>nextSqSingle(), 300);
    }else{
      $('#sqsFeedback').className = 'feedback err';
      $('#sqsFeedback').textContent = `✗ 错误，正确答案：${sqSingle.cur*sqSingle.cur}`;
      sqSingle.questions.push({
        number: sqSingle.cur, answer: sqSingle.cur*sqSingle.cur,
        user, correct: false, usedSec
      });
      sqSingle.cur = null;
      $('#sqsInput').disabled = true;
      $$('.numpad-key', $('#sqsNumpad')).forEach(k=>k.disabled = true);
      sqSingle.autoNextTimer = setTimeout(()=>nextSqSingle(), 1200);
    }
  }

  function revealSqSingle(){
    if(!sqSingle.cur || sqSingle.paused) return;
    sqSingle.revealing = true;
    const ans = sqSingle.cur * sqSingle.cur;
    $('#sqsFeedback').className = 'feedback info';
    $('#sqsFeedback').textContent = `答案：${ans}（点击"跳过"继续）`;
    $('#sqsInput').disabled = true;
    $$('.numpad-key', $('#sqsNumpad')).forEach(k=>k.disabled = true);
    sqSingle.questions.push({
      number: sqSingle.cur, answer: ans,
      user: '(查看答案)', correct: false,
      usedSec: (Date.now()-sqSingle.curStart)/1000
    });
    sqSingle.cur = null;
  }

  function endSqSingle(){
    if(sqSingle.paused) toggleSqPause();
    sqSingle.cur = null;
    stopSqSingleTimers();
    showSummary({
      type:'平方数练习（单题）',
      questions: sqSingle.questions.map(q=>({
        expr: q.number+'²', answer: q.answer,
        displayAnswer: String(q.answer), errorPct: '-',
        userText: String(q.user), correct: q.correct, usedSec: q.usedSec
      })),
      totalSec: (Date.now()-sqSingle.start)/1000
    });
  }

  function stopSqSingleTimers(){
    clearInterval(sqSingle.timer); sqSingle.timer=null;
    clearTimeout(sqSingle.autoNextTimer); sqSingle.autoNextTimer=null;
  }

  function flashSqFeedback(type, msg){
    $('#sqsFeedback').className = 'feedback '+type;
    $('#sqsFeedback').textContent = msg;
  }

  /* ---------- 平方数固定题数练习 ---------- */
  const sqFixed = { questions:[], start:0, timer:null };

  function startSquareFixed(){
    lastPracticeSource = 'square';
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
    list.addEventListener('input', onSqFixedInput);
    $('#sqfCount').textContent = n;
    sqFixed.timer = setInterval(tickSqFixed, 200);
    go('square-fixed');
    const first = $('.fi-input', list);
    if(first) first.focus();
  }

  function onSqFixedInput(e){
    const inp = e.target.closest('.fi-input'); if(!inp) return;
    const i = +inp.dataset.i;
    const item = inp.closest('.fixed-item');
    const val = inp.value.trim();
    sqFixed.questions[i].user = val;
    if(val===''){ item.classList.remove('done'); return; }
    item.classList.add('done');
    $('#sqfDone').textContent = sqFixed.questions.filter(q=>q.user!=='').length;
  }

  function tickSqFixed(){
    const total = (Date.now()-sqFixed.start)/1000;
    $('#sqfTotalTime').textContent = fmtTime(total);
    $('#sqfDone').textContent = sqFixed.questions.filter(q=>q.user!=='').length;
  }

  function submitSqFixed(){
    const totalSec = (Date.now()-sqFixed.start)/1000;
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

  function abortSqFixed(){
    stopSqFixedTimers();
    go('home');
  }

  function stopSqFixedTimers(){
    clearInterval(sqFixed.timer); sqFixed.timer=null;
  }

  function stopAllSquareTimers(){
    stopSqSingleTimers();
    stopSqFixedTimers();
  }

  /* ---------- 事件绑定 ---------- */
  function bind(){
    // 通用跳转
    document.addEventListener('click', e=>{
      const b = e.target.closest('[data-go]');
      if(b){ go(b.dataset.go); }
    });

    initChips('cfgOps','ops');
    initChips('cfgA','aDigits');
    initChips('cfgB','bDigits');
    initSegs('cfgMode','mode',false);
    initSegs('cfgAnswer','answer',false);
    initSegs('cfgCount','count',true);

    // 手动修改配置时取消快速配置选中状态（排除题型类别、答题方式和题目数量）
    function clearQuickPreset(){
      $$('.quick-chip.active').forEach(c=>c.classList.remove('active'));
    }
    const mainCard = $('.cfg-main-card');
    if(mainCard){
      mainCard.addEventListener('click', e=>{
        const t = e.target.closest('.chip,.seg');
        if(t && !t.classList.contains('quick-chip')){
          // 排除 cfgMode / cfgAnswer / cfgCount 区域
          const wrap = t.closest('#cfgMode,#cfgAnswer,#cfgCount');
          if(!wrap) clearQuickPreset();
        }
      });
    }

    // 快速配置预设
    function applyPreset(ops, aDigits, bDigits){
      cfg.ops = ops;
      cfg.aDigits = aDigits;
      cfg.bDigits = bDigits;
      ['cfgOps','cfgA','cfgB'].forEach((id,key)=>{
        const k = ['ops','aDigits','bDigits'][key];
        const parent = $('#'+id);
        if(!parent) return;
        $$('.chip',parent).forEach(c=>{
          c.classList.toggle('active', cfg[k].some(v=>String(v)===String(c.dataset.val)));
        });
      });
    }
    $('#quickPresets').addEventListener('click', e=>{
      const b = e.target.closest('.quick-chip');
      if(!b) return;
      try{
        const ops = JSON.parse(b.dataset.ops);
        const a = JSON.parse(b.dataset.a);
        const bVals = JSON.parse(b.dataset.b);
        applyPreset(ops, a, bVals);
        $$('.quick-chip').forEach(c=>c.classList.remove('active'));
        b.classList.add('active');
        showTip('');
      }catch(err){
        showTip('预设配置出错');
      }
    });

    function showTip(msg, isErr){
      const tip = $('#cfgTip');
      if(!tip) return;
      tip.textContent = msg || '';
      tip.style.color = isErr ? 'var(--err)' : 'var(--err)';
    }

    $('#startBasic').addEventListener('click', ()=>{
      try{
        showTip('');
        if(cfg.ops.length===0){ showTip('请至少选择一种运算类别'); return; }
        if(cfg.aDigits.length===0){ showTip('请选择第一个数的位数'); return; }
        if(cfg.bDigits.length===0){ showTip('请选择第二个数的位数'); return; }
        // 生成 1 道样题进行预校验，提前暴露不合法配置
        const sample = genQuestion();
        if(!sample || typeof sample.answer!=='number' || !isFinite(sample.answer)){
          showTip('当前配置无法生成有效题目，请调整位数范围（尤其是除法）');
          return;
        }
        if(cfg.mode==='single') startSingle();
        else startFixed();
      }catch(err){
        console.error(err);
        showTip('启动失败：'+(err&&err.message?err.message:String(err)));
      }
    });

    // 单题练习
    $('#singlePause').addEventListener('click', togglePause);
    $('#singleNext').addEventListener('click', ()=>nextSingle());
    $('#singleReveal').addEventListener('click', revealSingle);
    $('#singleEnd').addEventListener('click', endSingle);
    $('#singleInput').addEventListener('input', restrictNumericInput);
    $('#singleInput').addEventListener('keydown', e=>{
      if(e.key==='Enter' && !single.paused){ e.preventDefault(); submitSingle(); }
    });
    // 选择题：方向键快速作答（仅单题模式）
    document.addEventListener('keydown', e=>{
      const av = document.querySelector('.view.active');
      if(!av || av.dataset.view !== 'single') return;
      if(cfg.answer !== 'choice' || !single.cur || single.paused) return;
      const map = {ArrowUp:0, ArrowLeft:1, ArrowRight:2, ArrowDown:3};
      if(e.key in map){ e.preventDefault(); chooseSingle(map[e.key]); }
    });
    // 数字软键盘
    $('#numpad').addEventListener('click', e=>{
      const key = e.target.closest('.numpad-key');
      if(!key || key.disabled) return;
      const val = key.dataset.key;
      if(val === 'confirm'){ submitSingle(); return; }
      if(val === 'clear'){ $('#singleInput').value = ''; return; }
      if(val === 'backspace'){
        const inp = $('#singleInput');
        inp.value = inp.value.slice(0, -1);
        return;
      }
      // 数字、小数点
      const inp = $('#singleInput');
      inp.value += val;
      // 触发输入过滤（保证小数点唯一等）
      restrictNumericInput({target:inp});
    });

    // 固定题数
    $('#fixedConfirm').addEventListener('click', submitFixed);
    $('#fixedEnd').addEventListener('click', submitFixed);

    // 结算页返回按钮
    $('#sumBack').addEventListener('click', ()=>{
      if(lastPracticeSource === 'square') openFormula('square');
      else go('basic-config');
    });

    // 结算页再来一次（按上次配置）
    $('#sumAgain').addEventListener('click', ()=>{
      if(!lastConfigSnapshot) { go('home'); return; }
      Object.assign(cfg, JSON.parse(JSON.stringify(lastConfigSnapshot)));
      // 同步 UI 选中态（兼容字符串/数字混合的历史快照）
      ['cfgOps','cfgA','cfgB'].forEach((id,key)=>{
        const k = ['ops','aDigits','bDigits'][key];
        const parent = $('#'+id);
        if(!parent) return;
        $$('.chip',parent).forEach(c=>{
          const has = cfg[k].some(v=>String(v)===String(c.dataset.val));
          c.classList.toggle('active', has);
        });
      });
      const modeWrap = $('#cfgMode'), countWrap = $('#cfgCount');
      if(modeWrap) $$('.seg',modeWrap).forEach(s=>s.classList.toggle('active', String(s.dataset.val)===String(cfg.mode)));
      if(countWrap) $$('.seg',countWrap).forEach(s=>s.classList.toggle('active', +s.dataset.val===+cfg.count));
      const ansWrap = $('#cfgAnswer');
      if(ansWrap) $$('.seg',ansWrap).forEach(s=>s.classList.toggle('active', String(s.dataset.val)===String(cfg.answer)));
      $('#fixedCountWrap').style.display = cfg.mode==='fixed'?'':'none';
      try{
        if(cfg.mode==='single') startSingle(); else startFixed();
      }catch(err){
        console.error(err);
        $('#cfgTip') && ($('#cfgTip').textContent = '启动失败：'+err.message);
      }
    });

    // 清空历史
    $('#clearHistory').addEventListener('click', ()=>{
      localStorage.removeItem(LS_KEY);
      renderHistory();
    });

    // 公式菜单
    $$('[data-formula]').forEach(b=>{
      b.addEventListener('click', ()=>openFormula(b.dataset.formula));
    });

    // ---------- 平方数配置 ----------
    initSquareChips();
    // 绑定 sqMode 到 squareCfg
    (function(){
      const wrap = $('#sqMode');
      if(!wrap) return;
      wrap.addEventListener('click', e=>{
        const b = e.target.closest('.seg'); if(!b) return;
        $$('.seg',wrap).forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        squareCfg.mode = b.dataset.val;
        const cw = $('#sqFixedCountWrap');
        if(cw) cw.style.display = squareCfg.mode==='fixed' ? '' : 'none';
      });
    })();
    // 重新绑定 sqCount
    (function(){
      const wrap = $('#sqCount');
      if(!wrap) return;
      wrap.addEventListener('click', e=>{
        const b = e.target.closest('.seg'); if(!b) return;
        $$('.seg',wrap).forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        squareCfg.count = +b.dataset.val;
      });
    })();

    // 平方数开始练习
    $('#startSquare').addEventListener('click', ()=>{
      if(squareCfg.ranges.length===0){
        updateSquareTip();
        return;
      }
      if(squareCfg.mode==='single') startSquareSingle();
      else startSquareFixed();
    });

    // 平方数单题
    $('#sqsPause').addEventListener('click', toggleSqPause);
    $('#sqsNext').addEventListener('click', ()=>nextSqSingle());
    $('#sqsReveal').addEventListener('click', revealSqSingle);
    $('#sqsEnd').addEventListener('click', endSqSingle);
    $('#sqsInput').addEventListener('keydown', e=>{
      if(e.key==='Enter' && !sqSingle.paused){ e.preventDefault(); submitSqSingle(); }
    });
    $('#sqsInput').addEventListener('input', function(){
      this.value = this.value.replace(/\D/g, '');
    });
    // 平方数数字软键盘
    $('#sqsNumpad').addEventListener('click', e=>{
      const key = e.target.closest('.numpad-key');
      if(!key || key.disabled) return;
      const val = key.dataset.key;
      if(val === 'confirm'){ submitSqSingle(); return; }
      if(val === 'clear'){ $('#sqsInput').value = ''; return; }
      if(val === 'backspace'){
        const inp = $('#sqsInput');
        inp.value = inp.value.slice(0, -1);
        return;
      }
      const inp = $('#sqsInput');
      inp.value += val;
    });

    // 平方数固定题数
    $('#sqfConfirm').addEventListener('click', submitSqFixed);
    $('#sqfEnd').addEventListener('click', submitSqFixed);
  }

  /* ---------- 启动 ---------- */
  function bootstrap(){
    try{
      bind();
      updateCfgTip();
      updateSquareTip();
      go('home');
    }catch(err){
      console.error(err);
      // 让启动错误可见
      const msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;inset:auto 12px 12px 12px;background:#fee;color:#c33;'
        +'padding:12px 14px;border-radius:10px;z-index:9999;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.1)';
      msg.textContent = '初始化失败：'+(err&&err.message?err.message:String(err));
      document.body.appendChild(msg);
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrap);
  }else{
    bootstrap();
  }
})();
