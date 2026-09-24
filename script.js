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
    'square-fixed':'平方数练习 · 固定题数',
    'bhf-single':'百化分练习 · 单题',
    'bhf-fixed':'百化分练习 · 固定题数'
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

    if(Math.abs(correct) < 10){
      // 个位数（含答案为 0）：绝对偏移 ±1,±2,±3…
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
    recordLaunch('basic', cfg);
    single.questions = [];
    single.paused = false;   // 重置暂停状态，避免沿用上次练习的累计暂停时长导致计时为负
    single.pausedTotal = 0;
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
      const cur = (now - single.curStart)/1000;
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
      const pausedMs = Date.now() - single.pauseStart;
      single.pausedTotal += pausedMs;
      single.curStart += pausedMs;   // 当前题开始时间后移，使该题用时不含暂停
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
      totalSec: (Date.now()-single.start - single.pausedTotal)/1000,   // 扣除暂停时长，统计纯练习用时
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
    recordLaunch('basic', cfg);
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
    stopBHFAllTimers();
  }

  /* ---------- 结算页 ---------- */
  let lastSummary = null;
  let lastLaunch = null;      // 最近一次真实练习的启动描述 {source, config}
  let activeLaunch = null;    // 当前结算页“再来一次”使用的启动描述
  let lastPracticeSource = 'basic';
  let summaryFromHistory = false;   // 当前结算是否为历史回看（决定“返回”去向）

  // 记录一次练习的启动描述，供“再来一次”重用
  function recordLaunch(source, config){
    lastLaunch = { source, config: JSON.parse(JSON.stringify(config)) };
  }

  function showSummary(data, persist=true, launch){
    lastSummary = data;
    summaryFromHistory = !persist;   // 仅历史回看以 persist=false 调用
    // “再来一次”用的启动描述：显式传入（历史回看）优先，否则用最近一次真实练习
    activeLaunch = launch || lastLaunch;
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

    summaryFilter = 'all';
    renderSummaryDetails();
    refreshSumFilter();

    // 保存记录（历史回看不重复保存）；同时存入启动描述供历史“再来一次”重跑
    if(persist){
      saveRecord({
        type: data.type,
        time: nowStr(),
        count: qs.length,
        correct,
        acc,
        totalSec: total,
        avgSec: avg,
        allowedErr: data.allowedErr,
        launch: lastLaunch ? JSON.parse(JSON.stringify(lastLaunch)) : null,
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
     source: 'basic' | 'square' | 'bhf' ；config 为对应模块配置的快照。 */
  function launchPractice(source, config){
    if(source === 'square'){
      squareCfg.ranges = config.ranges.slice();
      squareCfg.mode = config.mode || 'single';
      squareCfg.count = config.count || 5;
      squareCfg.repeatWrong = !!config.repeatWrong;
      syncSquareCfgUI();
      if(squareCfg.mode==='single') startSquareSingle();
      else startSquareFixed();
    }else if(source === 'bhf'){
      bhfCfg.ranges = new Set(config.ranges);
      bhfCfg.mode = config.mode || 'single';
      bhfCfg.count = config.count || 5;
      bhfCfg.limitPreset = !!config.limitPreset;
      bhfCfg.repeatWrong = !!config.repeatWrong;
      syncBHFCfgUI();
      if(bhfCfg.mode==='single') startBHFHandSingle();
      else startBHFHandFixed();
    }else{
      Object.assign(cfg, config);
      // 同步基本计算 UI 选中态（兼容字符串/数字混合）
      ['cfgOps','cfgA','cfgB'].forEach((id,key)=>{
        const k = ['ops','aDigits','bDigits'][key];
        const parent = $('#'+id); if(!parent) return;
        $$('.chip',parent).forEach(c=>{
          c.classList.toggle('active', cfg[k].some(v=>String(v)===String(c.dataset.val)));
        });
      });
      const modeWrap = $('#cfgMode'), countWrap = $('#cfgCount');
      if(modeWrap) $$('.seg',modeWrap).forEach(s=>s.classList.toggle('active', String(s.dataset.val)===String(cfg.mode)));
      if(countWrap) $$('.seg',countWrap).forEach(s=>s.classList.toggle('active', +s.dataset.val===+cfg.count));
      const ansWrap = $('#cfgAnswer');
      if(ansWrap) $$('.seg',ansWrap).forEach(s=>s.classList.toggle('active', String(s.dataset.val)===String(cfg.answer)));
      const fixedWrap = $('#fixedCountWrap');
      if(fixedWrap) fixedWrap.style.display = cfg.mode==='fixed'?'':'none';
      if(cfg.mode==='single') startSingle(); else startFixed();
    }
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
    const cb = $('#bhfRepeatWrong'); if(cb) cb.checked = bhfCfg.repeatWrong;
  }
  // 通用：将某个 seg 组的高亮设为指定值
  function bindSegTo(id, val){
    const wrap = $('#'+id); if(!wrap) return;
    $$('.seg',wrap).forEach(s=>s.classList.toggle('active', String(s.dataset.val)===String(val)));
  }

  /* ---------- 结算明细筛选 ---------- */
  let summaryFilter = 'all';   // all | ok | warn | err
  // 本次结算的允许误差（%）：百化分依配置（1 或 2），平方数无容差为 0，其余为 2
  function summaryErrBound(){
    if(lastSummary && lastSummary.type.includes('百化分'))
      return lastSummary.allowedErr !== undefined ? lastSummary.allowedErr : bhfAllowedErr();
    if(lastSummary && lastSummary.type.includes('平方数')) return 0;
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
    if(!lastSummary) return;
    const qs = lastSummary.questions;
    const cnt = { all:qs.length, ok:0, warn:0, err:0 };
    qs.forEach(q=>cnt[summaryTierOf(q)]++);
    ['ok','warn','err'].forEach(k=>{
      const b = $(`#sumFilter .seg[data-f="${k}"]`);
      if(b) b.textContent = tierLabel(k) + ` (${cnt[k]})`;
    });
    const allB = $('#sumFilter .seg[data-f="all"]');
    if(allB) allB.textContent = `全部 (${cnt.all})`;
    $$('#sumFilter .seg').forEach(x=>x.classList.toggle('active', x.dataset.f === summaryFilter));
  }
  // 按当前筛选渲染明细
  function renderSummaryDetails(){
    if(!lastSummary) return;
    const data = lastSummary;
    const detail = $('#sumDetail');
    if(!detail) return;
    const isFixed = data.type.includes('固定题数');
    detail.className = 'detail-list' + (isFixed ? ' no-time' : '');
    detail.innerHTML = '';
    const isFill = data.answerMode !== 'choice';   // 填空模式（含平方数练习）
    const qs = data.questions.filter(q=> summaryFilter==='all' || summaryTierOf(q)===summaryFilter);
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
      totalSec: r.totalSec,
      allowedErr: r.allowedErr
    }, false, r.launch);
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
  /* U 型百化分交互区：百分数沿 U 型条连续排列，悬停显示该位置对应的分数 */
  /* U 型百化分预设点：分三段（左臂 / 半圆弧 / 右臂），只写百分数，分数自动换算。
     需要手动增删点：直接修改下面数组即可。 */
  const BHF_PRESET = {
    left:[2,2.2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9],                             // 左臂（上→下）
    arc:[9.5,10,10.5],                                                                      // 半圆弧（左→底部10→右）
    right:[11,11.5,12,13,14,15,16,17,18,19,20,23,25,27,30,35,40,45,50] // 右臂（下→上）
  };
  // 上图标注的全部百分数（供“仅从上图百分数中出题”使用）
  const BHF_PRESET_ALL = [].concat(BHF_PRESET.left, BHF_PRESET.arc, BHF_PRESET.right);

  function renderBHF(el){
    const ARCLO=9, ARCCTR=10, ARCHI=11;   // 半圆弧：左端9 → 中心10(最底部) → 右端11，保证10在弧正中
    const PLTOP=2, PRTOP=50;                // 左右臂顶端百分数（互余：2×50=100）
    const VB=340, VBH=400;                  // SVG viewBox 尺寸
    // 窄长 U 型（在 viewBox 内居中）：两臂接近，底部为半圆弧（体现对称性）
    const LARM=120, RARM=220, TOP=12, BT=316;
    const D=`M${LARM} ${TOP} L${LARM} ${BT} A50 50 0 0 0 ${RARM} ${BT} L${RARM} ${TOP}`;
    const LEN=BT-TOP;                       // 单臂垂直长度
    const NS='http://www.w3.org/2000/svg';

    el.innerHTML = `
      <svg class="bhf-svg" id="bhfSvg" viewBox="0 0 ${VB} ${VBH}" preserveAspectRatio="xMidYMid meet">
        <path id="bhfPath" d="${D}" fill="none" stroke="#c9d8f7" stroke-width="10" stroke-linecap="round"/>
        <path id="bhfBar" d="${D}" fill="none" stroke="#5b7bd9" stroke-width="2" stroke-linecap="round"/>
        <path d="${D}" fill="none" stroke="#5b7bd9" stroke-width="1" stroke-dasharray="2 4" opacity=".5"/>
      </svg>
    `;
    // 去掉 formula-box 的大留白，给 SVG 腾出空间
    el.style.padding='4px'; el.style.margin='0 0 8px';
    el.style.minHeight='0';
    el.style.overflow='visible';
    el.style.position='relative';

    const svg = $('#bhfSvg');
    const path = $('#bhfPath');
    const total = path.getTotalLength();
    const arcLen = total - LEN*2;

    // 位置(+)：百分数 p <=> 所在长度 t
    // 左臂 2(顶)→9.1(底)；圆弧 9.1→11.1（中心=10 最底部，左右 9.5/10.5 约在 1/4、3/4 处）；右臂 11.1(底)→50(顶)
    // 左右臂用对数映射，使互为倒数的百分数（如 7.7% 与 13%）落于同一高度
    function lenAt(p){
      if(p <= ARCLO)  return Math.log(p/PLTOP)/Math.log(ARCLO/PLTOP)*LEN;
      if(p < ARCHI){
        const f = p <= ARCCTR ? (p-ARCLO)/(ARCCTR-ARCLO)*0.5 : 0.5 + (p-ARCCTR)/(ARCHI-ARCCTR)*0.5;
        return LEN + f*arcLen;
      }
      return LEN+arcLen + Math.log(p/ARCHI)/Math.log(PRTOP/ARCHI)*LEN;
    }
    function pAt(t){
      if(t < LEN)        return PLTOP*Math.pow(ARCLO/PLTOP, t/LEN);
      if(t < LEN+arcLen){
        const f=(t-LEN)/arcLen;
        return f <= 0.5 ? ARCLO + f/0.5*(ARCCTR-ARCLO) : ARCCTR + (f-0.5)/0.5*(ARCHI-ARCCTR);
      }
      const r=(t-LEN-arcLen)/LEN;
      return ARCHI*Math.pow(PRTOP/ARCHI, r);
    }

    // 数值显示：去掉多余的尾随零（如 6.25 → "6.25"，10 → "10"）
    function strip(v){ v=Math.round(v*100)/100; return String(v); }
    // 分数换算：1/(100/p)，保留 1 位小数（如 7.7%→1/13，13%→1/7.7）
    function denom(p){ const n=Math.round(1000/p)/10; return Math.round(n)===n ? String(Math.round(n)) : strip(n); }
    function fracStr(p){ return '1/'+denom(p); }

    // 渲染一个锚点：圆点 + 百分数（外侧）+ 分数（内侧）；半圆弧为「分数在上、百分数在下」
    const PS=9, FS=9;   // 百分数 / 分数 字号
    function addPoint(p, side){
      const t=lenAt(p);
      const pt=path.getPointAtLength(t);
      const g=document.createElementNS(NS,'g');
      g.setAttribute('class','bhf-ancg');
      const c=document.createElementNS(NS,'circle');
      c.setAttribute('cx',pt.x); c.setAttribute('cy',pt.y);
      c.setAttribute('r',3.2); c.setAttribute('fill','#5b7bd9');
      g.appendChild(c);
      const mk=(text,cls,x,y,anch)=>{
        const tt=document.createElementNS(NS,'text');
        tt.setAttribute('x',x); tt.setAttribute('y',y);
        tt.setAttribute('text-anchor',anch);
        tt.setAttribute('font-size',cls==='bhf-f'?FS:PS);
        tt.setAttribute('class',cls); tt.textContent=text;
        g.appendChild(tt);
      };
      const pstr=strip(p)+'%', fstr=fracStr(p);
      if(side==='left'){
        mk(pstr,'bhf-p',pt.x-12,pt.y+3,'end');    // 外侧=百分数，距圆点左侧
        mk(fstr,'bhf-f',pt.x+12,pt.y+3,'start');   // 内侧=分数，距圆点右侧
      }else if(side==='right'){
        mk(pstr,'bhf-p',pt.x+12,pt.y+3,'start');  // 外侧=百分数，距圆点右侧
        mk(fstr,'bhf-f',pt.x-12,pt.y+3,'end');     // 内侧=分数，距圆点左侧
      }else if(p < ARCCTR){
        // 前半弧（9→10）：分数右上、百分数左下
        mk(fstr,'bhf-f',pt.x+12, pt.y-10,'middle');
        mk(pstr,'bhf-p',pt.x-12, pt.y+10,'middle');
      }else if(p > ARCCTR){
        // 后半弧（10→11）：分数左上、百分数右下
        mk(fstr,'bhf-f',pt.x-12, pt.y-10,'middle');
        mk(pstr,'bhf-p',pt.x+12, pt.y+10,'middle');
      }else{
        // 弧底部中心10：分数在上、百分数在下
        mk(fstr,'bhf-f',pt.x,pt.y-13,'middle');
        mk(pstr,'bhf-p',pt.x,pt.y+13,'middle');
      }
      svg.appendChild(g);
    }
    BHF_PRESET.left.forEach(p=>addPoint(p,'left'));
    BHF_PRESET.arc.forEach(p=>addPoint(p,'arc'));
    BHF_PRESET.right.forEach(p=>addPoint(p,'right'));

    // 悬停跟随提示
    const tip=document.createElement('div');
    tip.className='bhf-tip';
    el.appendChild(tip);

    function fmt(v){ return String(Math.round(v*10)/10); }

    let raf=null;
    function handle(e){
      if(raf) cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        const rect=svg.getBoundingClientRect();
        const x=(e.clientX-rect.left)*(VB/rect.width);
        const y=(e.clientY-rect.top)*(VBH/rect.height);
        let bestL=0, best=Infinity;
        for(let l=0;l<=total;l+=2){
          const p=path.getPointAtLength(l);
          const dd=((p.x-x)*(p.x-x)+(p.y-y)*(p.y-y));
          if(dd<best){best=dd;bestL=l;}
        }
        const nearOk=Math.sqrt(best) < 16;
        sync2(e.clientX, e.clientY, bestL, nearOk);
      });
    }
    function sync2(mx, my, l, ok){
      const p=pAt(l);
      const den=100/p;
      const text=`${fmt(p)}% = 1/${fmt(Math.round(den*10)/10)}`;
      const er=el.getBoundingClientRect();
      tip.textContent=text;
      tip.style.left=(mx-er.left+12)+'px';
      tip.style.top=(my-er.top-8)+'px';
      tip.style.transform='translateY(-100%)';
      tip.style.display=ok?'block':'none';
    }
    svg.addEventListener('mousemove', handle);
    svg.addEventListener('mouseleave', ()=>{ tip.style.display='none'; });
  }

  function openFormula(key){
    const info = FORMULA_INFO[key];
    $('#fdTitle').textContent = info.title;
    const el = $('#fdFormula');
    el.style.overflow = '';
    // 平方数显示 1~30 平方数表
    if(key === 'square'){
      const cells = [];
      for(let i=1;i<=30;i++){
        cells.push(`<span><b>${i}<sup>2</sup></b><i>=${i*i}</i></span>`);
      }
      el.innerHTML = '<div class="square-table">'+cells.join('')+'</div>';
    }else if(key === 'percent'){
      // 百化分：U 型交互区
      renderBHF(el);
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
    // 平方数/百化分显示内容，其他公式显示占位
    const pcCfg = $('#fdPercentConfig');
    const sqCfg = $('#fdSquareConfig');
    const ph = $('#fdPlaceholder');
    if(key === 'square'){
      sqCfg.style.display = '';
      pcCfg.style.display = 'none';
      ph.style.display = 'none';
      // 重置平方数配置提示
      const tip = $('#sqCfgTip');
      if(tip) tip.textContent = '';
    }else if(key === 'percent'){
      pcCfg.style.display = '';
      sqCfg.style.display = 'none';
      ph.style.display = 'none';
      const tip = $('#bhfCfgTip');
      if(tip) tip.textContent = '';
    }else{
      pcCfg.style.display = 'none';
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

  /* ---------- 平方数单题练习 ---------- */
  const sqSingle = {
    questions:[], cur:null, last:null, curStart:0, start:0,
    timer:null, autoNextTimer:null,
    // 错题重复：记下待重做的错题数，达到“答错→重复，答对→换新题”
    pending:null,
    // 当前题是否为错题重做（重做不计入出题频率调整）
    isRepeat:false,
    revealing:false, paused:false, pauseStart:0, pausedTotal:0
  };

  function startSquareSingle(){
    lastPracticeSource = 'square';
    recordLaunch('square', { ranges: squareCfg.ranges.slice(), mode: squareCfg.mode, count: squareCfg.count, repeatWrong: squareCfg.repeatWrong });
    adaptReset();   // 本次练习的记忆频率从零开始
    sqSingle.questions = [];
    sqSingle.pending = null;
    sqSingle.paused = false;   // 重置暂停状态，避免沿用上次练习的累计暂停时长导致计时为负
    sqSingle.pausedTotal = 0;
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
      const cur = (now - sqSingle.curStart)/1000;
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
      const pausedMs = Date.now() - sqSingle.pauseStart;
      sqSingle.pausedTotal += pausedMs;
      sqSingle.curStart += pausedMs;   // 当前题开始时间后移，使该题用时不含暂停
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
    // 从选中范围中随机选数，避免连续重复；若非空待重做错题，则优先重做该题
    const pool = squareCfg.ranges;
    if(pool.length===0) return;
    let next;
    if(sqSingle.pending !== null){
      next = sqSingle.pending;   // 重做错题
      sqSingle.pending = null;   // 消费掉，答错时在提交处重新入队直至答对
      sqSingle.isRepeat = true;  // 错题重做不计入频率调整
    }else{
      sqSingle.isRepeat = false;
      if(pool.length>1 && sqSingle.last !== null){
        const filtered = pool.filter(n=>n!==sqSingle.last);
        next = adaptPick(filtered);   // 加权随机：熟题出现频率低，错题出现频率高；同时剔除上一题避免连续重复
      }else{
        next = adaptPick(pool);
      }
    }
    sqSingle.last = next;   // 记录本题目（含错题重做），供下一题避免连续重复
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
    if(!sqSingle.isRepeat) adaptUpdate(sqSingle.cur, correct, usedSec, correct);   // 平方数为整数精确匹配，判对即零误差
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
      if(squareCfg.repeatWrong) sqSingle.pending = sqSingle.cur;   // 错题重做
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
    if(!sqSingle.isRepeat) adaptUpdate(sqSingle.cur, false, (Date.now()-sqSingle.curStart)/1000, false);   // 查看答案视同答错，提高频率；重做不计
    $('#sqsFeedback').className = 'feedback info';
    $('#sqsFeedback').textContent = `答案：${ans}（点击"跳过"继续）`;
    $('#sqsInput').disabled = true;
    $$('.numpad-key', $('#sqsNumpad')).forEach(k=>k.disabled = true);
    if(squareCfg.repeatWrong) sqSingle.pending = sqSingle.cur;   // 查看答案视同答错，重做
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
      totalSec: (Date.now()-sqSingle.start - sqSingle.pausedTotal)/1000   // 扣除暂停时长，统计纯练习用时
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
    recordLaunch('square', { ranges: squareCfg.ranges.slice(), mode: squareCfg.mode, count: squareCfg.count, repeatWrong: squareCfg.repeatWrong });
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

  /* ---------- 百化分练习 ----------
     在选中范围内随机生成最多 1 位小数的百分数 p，
     用户回答对应分数 1/(100/p) 的分母，精确答案保留 1 位小数。
     允许误差：默认 2%；勾选“仅从上图百分数中出题”（limitPreset）时收紧到 1%。 */
  // 范围按全开区间处理（(1,10)、(10,20)、(20,50)）：端点值 1%、10%、20%、50% 为纯定义/常识，不纳入出题
  const BHF_RANGES = { '1-10':[1,10], '10-20':[10,20], '20-50':[20,50] };
  const bhfCfg = { ranges:new Set(), mode:'single', count:5, limitPreset:false, repeatWrong:false };

  // 百化分允许误差（%）：勾选“仅从上图百分数中出题”时收紧到 1%，否则 2%
  function bhfAllowedErr(){
    return bhfCfg.limitPreset ? 1 : 2;
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
  // 生成一个百分数（最多 1 位小数）；last 为上一题百分数时尽量避免与其相同（预设池直接剔除，连续池重试）
  function bhfGenPercent(last){
    const cands = bhfCandidates();
    if(cands){
      if(cands.length>1 && last !== null){
        const filtered = cands.filter(p=>p!==last);
        return filtered[rand(0, filtered.length-1)];
      }
      return cands[rand(0, cands.length-1)];
    }
    const keys = Array.from(bhfCfg.ranges);
    const key = keys[rand(0, keys.length-1)];
    const [min, max] = BHF_RANGES[key];
    let p = rand(min*10+1, max*10-1)/10;   // 开区间：剔除端点值（如 1.0、10.0、20.0、50.0）
    if(last !== null && Math.abs(p-last)<0.05){
      for(let k=0;k<3 && Math.abs(p-last)<0.05;k++) p = rand(min*10+1, max*10-1)/10;
    }
    return p;
  }
  // 单题模式的百分数生成：仅图出题时按记忆频率加权选预设值（剔除上一题），否则走均匀随机（同样避免与上一题相同）
  function bhfGenPercentAdapt(last){
    const cands = bhfCandidates();
    if(!cands) return bhfGenPercent(last);
    if(cands.length>1 && last !== null){
      const filtered = cands.filter(p=>p!==last);
      return adaptPick(filtered);
    }
    return adaptPick(cands);
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

  /* ---------- 百化分单题练习 ---------- */
  const bhfSingle = {
    questions:[], cur:null, last:null, curStart:0, start:0,
    timer:null, autoNextTimer:null,
    // 错题重复：记下待重做的错题百分数
    pending:null,
    // 当前题是否为错题重做（重做不计入出题频率调整）
    isRepeat:false,
    revealing:false, paused:false, pauseStart:0, pausedTotal:0
  };

  function startBHFHandSingle(){
    lastPracticeSource = 'bhf';
    recordLaunch('bhf', { ranges: [...bhfCfg.ranges], mode: bhfCfg.mode, count: bhfCfg.count, limitPreset: bhfCfg.limitPreset, repeatWrong: bhfCfg.repeatWrong });
    adaptReset();   // 本次练习的记忆频率从零开始
    const note = $('#bhfPadNote'); if(note) note.textContent = '误差≤' + bhfAllowedErr() + '%';
    bhfSingle.questions = [];
    bhfSingle.pending = null;
    bhfSingle.paused = false;   // 重置暂停状态，避免沿用上次练习的累计暂停时长导致计时为负
    bhfSingle.pausedTotal = 0;
    bhfSingle.start = Date.now();
    bhfSingle.timer = setInterval(tickBHFHandSingle, 200);
    go('bhf-single');
    nextBHFHandSingle(true);
  }

  function tickBHFHandSingle(){
    const now = bhfSingle.paused ? bhfSingle.pauseStart : Date.now();
    const elapsed = (now - bhfSingle.start - bhfSingle.pausedTotal)/1000;
    $('#bhfsTotalTime').textContent = fmtTime(elapsed);
    const n = bhfSingle.questions.length;
    $('#bhfsCount').textContent = n;
    const correct = bhfSingle.questions.filter(q=>q.correct).length;
    $('#bhfsAcc').textContent = n ? Math.round(correct/n*100)+'%' : '0%';
    $('#bhfsAvg').textContent = (n ? (elapsed/n).toFixed(1) : '0.0')+'s';
    if(bhfSingle.curStart){
      const cur = (now - bhfSingle.curStart)/1000;
      $('#bhfsCur').textContent = Math.max(0,cur).toFixed(1)+'s';
    }
  }

  function toggleBHFHandPause(){
    bhfSingle.paused = !bhfSingle.paused;
    const btn = $('#bhfsPause');
    const inp = $('#bhfsFracInput');
    const numpadKeys = $$('.numpad-key', $('#bhfsNumpad'));
    if(bhfSingle.paused){
      bhfSingle.pauseStart = Date.now();
      btn.textContent = '继续';
      btn.classList.add('paused');
      inp.disabled = true;
      numpadKeys.forEach(k=>k.disabled = true);
      clearTimeout(bhfSingle.autoNextTimer);
    }else{
      const pausedMs = Date.now() - bhfSingle.pauseStart;
      bhfSingle.pausedTotal += pausedMs;
      bhfSingle.curStart += pausedMs;   // 当前题开始时间后移，使该题用时不含暂停
      btn.textContent = '暂停';
      btn.classList.remove('paused');
      inp.disabled = false;
      inp.readOnly = isTouchDevice();
      numpadKeys.forEach(k=>k.disabled = false);
      if(!isTouchDevice()) inp.focus();
    }
  }

  function nextBHFHandSingle(isFirst){
    if(bhfSingle.paused) toggleBHFHandPause();
    if(!isFirst && bhfSingle.cur){
      bhfSingle.questions.push({
        percent: bhfSingle.cur.percent,
        answer: bhfSingle.cur.answer,
        user: null, correct: false,
        usedSec: (Date.now()-bhfSingle.curStart)/1000
      });
    }
    clearTimeout(bhfSingle.autoNextTimer);
    bhfSingle.revealing = false;
    if(bhfCfg.ranges.size===0) return;
    // 若非空待重做错题，则用该百分数重做（不计频率调整）；否则重新随机生成（避免与上一题相同）
    const isRepeat = bhfSingle.pending !== null;
    const p = isRepeat ? (()=>{ const v=bhfSingle.pending; bhfSingle.pending=null; return v; })() : bhfGenPercentAdapt(bhfSingle.last);
    bhfSingle.last = p;   // 记录本题目（含错题重做），供下一题避免连续重复
    bhfSingle.isRepeat = isRepeat;
    const ans = bhfAnswer(p);
    bhfSingle.cur = { percent:p, answer:ans };
    bhfSingle.curStart = Date.now();
    $('#bhfsIndex').textContent = `第 ${bhfSingle.questions.length+1} 题`;
    $('#bhfsExpr .bhf-expr-p').textContent = bhfStrip(p)+'%';
    const inp = $('#bhfsFracInput');
    inp.value = '';
    inp.disabled = false;
    inp.readOnly = isTouchDevice();
    $$('.numpad-key', $('#bhfsNumpad')).forEach(k=>k.disabled = false);
    $('#bhfsFeedback').className = 'feedback';
    $('#bhfsFeedback').textContent = '';
    if(!isTouchDevice()) inp.focus();
  }

  function submitBHFHandSingle(){
    if(!bhfSingle.cur || bhfSingle.paused) return;
    if(bhfSingle.revealing){ nextBHFHandSingle(); return; }
    const raw = $('#bhfsFracInput').value.trim();
    if(raw===''){ flashBHFHandFeedback('err','请输入分母'); return; }
    const user = parseFloat(raw);
    const ans = bhfSingle.cur.answer;
    const correct = bhfCheck(user, ans);
    const usedSec = (Date.now()-bhfSingle.curStart)/1000;
    // 仅图出题时更新频率；重做不计；只有零误差（user===ans）才允许降频，判对但带误差权重不变
    if(bhfCfg.limitPreset && !bhfSingle.isRepeat) adaptUpdate(bhfSingle.cur.percent, correct, usedSec, user === ans);
    if(correct){
      flashBHFHandFeedback('ok', `✓ 正确，分母约 ${ans}`);
    }else{
      flashBHFHandFeedback('err', `✗ 错误，精确值 ${ans}，误差 >${bhfAllowedErr()}%`);
      if(bhfCfg.repeatWrong) bhfSingle.pending = bhfSingle.cur.percent;   // 错题重做
    }
    bhfSingle.questions.push({ percent:bhfSingle.cur.percent, answer:ans, user, correct, usedSec });
    bhfSingle.cur = null;
    const inp = $('#bhfsFracInput');
    inp.disabled = true;
    $$('.numpad-key', $('#bhfsNumpad')).forEach(k=>k.disabled = true);
    bhfSingle.autoNextTimer = setTimeout(()=>nextBHFHandSingle(), correct?300:1200);
  }

  function revealBHFHandSingle(){
    if(!bhfSingle.cur || bhfSingle.paused) return;
    bhfSingle.revealing = true;
    if(bhfCfg.limitPreset && !bhfSingle.isRepeat) adaptUpdate(bhfSingle.cur.percent, false, (Date.now()-bhfSingle.curStart)/1000, false);   // 查看答案视同答错，提高频率；重做不计
    flashBHFHandFeedback('info', `答案：${bhfSingle.cur.answer}（点击"跳过"继续）`);
    $('#bhfsFracInput').disabled = true;
    $$('.numpad-key', $('#bhfsNumpad')).forEach(k=>k.disabled = true);
    if(bhfCfg.repeatWrong) bhfSingle.pending = bhfSingle.cur.percent;   // 查看答案视同答错，重做
    bhfSingle.questions.push({
      percent: bhfSingle.cur.percent, answer: bhfSingle.cur.answer,
      user: '(查看答案)', correct: false,
      usedSec: (Date.now()-bhfSingle.curStart)/1000
    });
    bhfSingle.cur = null;
  }

  function endBHFHandSingle(){
    if(bhfSingle.paused) toggleBHFHandPause();
    bhfSingle.cur = null;
    stopBHFHandSingleTimers();
    showSummary({
      type:'百化分练习（单题）',
      questions: bhfSingle.questions.map(q=>({
        expr: bhfStrip(q.percent)+'% = 1/？', answer: q.answer,
        displayAnswer: String(q.answer), errorPct: bhfErrPct(q.user, q.answer),
        userText: q.user===null ? '' : String(q.user), correct: q.correct, usedSec: q.usedSec
      })),
      totalSec: (Date.now()-bhfSingle.start - bhfSingle.pausedTotal)/1000,   // 扣除暂停时长，统计纯练习用时
      allowedErr: bhfAllowedErr()
    });
  }

  function stopBHFHandSingleTimers(){
    clearInterval(bhfSingle.timer); bhfSingle.timer=null;
    clearTimeout(bhfSingle.autoNextTimer); bhfSingle.autoNextTimer=null;
  }
  function flashBHFHandFeedback(type, msg){
    const fb = $('#bhfsFeedback');
    fb.className = 'feedback '+type;
    fb.textContent = msg;
  }

  /* ---------- 百化分固定题数练习 ---------- */
  const bhfFixed = { questions:[], start:0, timer:null };

  function startBHFHandFixed(){
    lastPracticeSource = 'bhf';
    recordLaunch('bhf', { ranges: [...bhfCfg.ranges], mode: bhfCfg.mode, count: bhfCfg.count, limitPreset: bhfCfg.limitPreset, repeatWrong: bhfCfg.repeatWrong });
    const n = bhfCfg.count;
    if(bhfCfg.ranges.size===0) return;
    bhfFixed.questions = [];
    let lastP = null;
    for(let i=0;i<n;i++){
      const p = bhfGenPercent(lastP);   // 内部已避免与上一题相同
      bhfFixed.questions.push({ percent:p, answer:bhfAnswer(p), userText:'', correct:false, usedSec:0 });
      lastP = p;
    }
    bhfFixed.start = Date.now();
    const list = $('#bhfList');
    list.innerHTML = '';
    bhfFixed.questions.forEach((q,i)=>{
      const item = document.createElement('div');
      item.className = 'fixed-item';
      item.innerHTML = `
        <span class="fi-idx">${i+1}</span>
        <span class="fi-expr">${bhfStrip(q.percent)}% = 1/</span>
        <input class="fi-input" inputmode="decimal" autocomplete="off" data-i="${i}" placeholder="分母 ?" />
      `;
      list.appendChild(item);
    });
    list.addEventListener('input', onBHFHandFixedInput);
    $('#bhfCount2').textContent = n;
    bhfFixed.timer = setInterval(tickBHFHandFixed, 200);
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
    if(val===''){ item.classList.remove('done'); return; }
    item.classList.add('done');
    $('#bhfDone').textContent = bhfFixed.questions.filter(q=>q.userText!=='').length;
  }

  function tickBHFHandFixed(){
    $('#bhfTotalTime').textContent = fmtTime((Date.now()-bhfFixed.start)/1000);
    $('#bhfDone').textContent = bhfFixed.questions.filter(q=>q.userText!=='').length;
  }

  function submitBHFHandFixed(){
    const totalSec = (Date.now()-bhfFixed.start)/1000;
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
        expr: bhfStrip(q.percent)+'% = 1/？', answer: q.answer,
        displayAnswer: String(q.answer), errorPct: bhfErrPct(q.userText, q.answer),
        userText: q.userText, correct: q.correct, usedSec: q.usedSec
      })),
      totalSec,
      allowedErr: bhfAllowedErr()
    });
  }

  function stopBHFHandFixedTimers(){
    clearInterval(bhfFixed.timer); bhfFixed.timer=null;
  }
  function stopBHFAllTimers(){
    stopBHFHandSingleTimers();
    stopBHFHandFixedTimers();
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
        // 软键盘留白说明：乘/除才允许误差
        const hasMult = cfg.ops.includes('mul') || cfg.ops.includes('div');
        $('#numPadNote').textContent = hasMult ? '误差≤2%' : '';
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
      if(summaryFromHistory){ go('history'); return; }   // 历史回看 → 返回历史列表
      if(lastPracticeSource === 'square') openFormula('square');
      else if(lastPracticeSource === 'bhf') openFormula('percent');
      else go('basic-config');
    });

    // 结算明细筛选
    (function(){
      const wrap = $('#sumFilter');
      if(!wrap) return;
      wrap.addEventListener('click', e=>{
        const b = e.target.closest('.seg'); if(!b) return;
        summaryFilter = b.dataset.f;
        refreshSumFilter();
        renderSummaryDetails();
      });
    })();

    // 结算页再来一次（按当前结算的启动描述重跑：正常练习用最近一次，历史回看用记录里的 launch）
    $('#sumAgain').addEventListener('click', ()=>{
      if(!activeLaunch){ go('home'); return; }
      try{
        launchPractice(activeLaunch.source, activeLaunch.config);
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
        const rw = $('#sqRepeatWrongWrap');
        if(rw) rw.style.display = squareCfg.mode==='single' ? '' : 'none';
      });
    })();
    // 绑定平方数错题重复勾选框
    (function(){
      const cb = $('#sqRepeatWrong');
      if(cb) cb.addEventListener('change', ()=> squareCfg.repeatWrong = cb.checked);
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
      // 平方数答案为整数，小数点键仅保留布局、不产生输入
      if(val === '.') return;
      const inp = $('#sqsInput');
      inp.value += val;
    });

    // 平方数固定题数
    $('#sqfConfirm').addEventListener('click', submitSqFixed);
    $('#sqfEnd').addEventListener('click', submitSqFixed);

    // ---------- 百化分配置 ----------
    initBHFChips();
    // 绑定 bhfMode 到 bhfCfg
    (function(){
      const wrap = $('#bhfMode');
      if(!wrap) return;
      wrap.addEventListener('click', e=>{
        const b = e.target.closest('.seg'); if(!b) return;
        $$('.seg',wrap).forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        bhfCfg.mode = b.dataset.val;
        const cw = $('#bhfFixedCountWrap');
        if(cw) cw.style.display = bhfCfg.mode==='fixed' ? '' : 'none';
        const rw = $('#bhfRepeatWrongWrap');
        if(rw) rw.style.display = bhfCfg.mode==='single' ? '' : 'none';
      });
    })();
    // 绑定百化分错题重复勾选框
    (function(){
      const cb = $('#bhfRepeatWrong');
      if(cb) cb.addEventListener('change', ()=> bhfCfg.repeatWrong = cb.checked);
    })();
    // 绑定 bhfCount
    (function(){
      const wrap = $('#bhfCount');
      if(!wrap) return;
      wrap.addEventListener('click', e=>{
        const b = e.target.closest('.seg'); if(!b) return;
        $$('.seg',wrap).forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        bhfCfg.count = +b.dataset.val;
      });
    })();

    // 百化分开始练习
    $('#startBHF').addEventListener('click', ()=>{
      if(bhfCfg.ranges.size===0){ updateBHFConfigTip($('#bhfRange')); return; }
      if(bhfCfg.mode==='single') startBHFHandSingle();
      else startBHFHandFixed();
    });

    // 百化分单题
    $('#bhfsPause').addEventListener('click', toggleBHFHandPause);
    $('#bhfsNext').addEventListener('click', ()=>nextBHFHandSingle());
    $('#bhfsReveal').addEventListener('click', revealBHFHandSingle);
    $('#bhfsEnd').addEventListener('click', endBHFHandSingle);
    $('#bhfsFracInput').addEventListener('keydown', e=>{
      if(e.key==='Enter' && !bhfSingle.paused){ e.preventDefault(); submitBHFHandSingle(); }
    });
    $('#bhfsFracInput').addEventListener('input', function(){
      const s = bhfSanitize(this.value);
      if(s !== this.value) this.value = s;
    });
    // 软键盘：仅允许一位小数的数字输入
    $('#bhfsNumpad').addEventListener('click', e=>{
      const key = e.target.closest('.numpad-key');
      if(!key || key.disabled) return;
      const val = key.dataset.key;
      const inp = $('#bhfsFracInput');
      if(val === 'confirm'){ submitBHFHandSingle(); return; }
      if(val === 'clear'){ inp.value = ''; return; }
      if(val === 'backspace'){ inp.value = inp.value.slice(0, -1); return; }
      if(val === '.'){
        if(inp.value.indexOf('.')>=0) return;
        inp.value = bhfSanitize(inp.value + '.');
        return;
      }
      if(val === '0' && inp.value==='') return;
      inp.value = bhfSanitize(inp.value + val);
    });

    // 百化分固定题数
    $('#bhfConfirm').addEventListener('click', submitBHFHandFixed);
    $('#bhfEnd').addEventListener('click', submitBHFHandFixed);
  }

  /* ---------- 暗色主题 ---------- */
  function initTheme(){
    const saved = localStorage.getItem('theme');
    const theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);

    const ICON_SUN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    const ICON_MOON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.title = '切换明暗主题';
    btn.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
    btn.addEventListener('click', ()=>{
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      btn.innerHTML = next === 'dark' ? ICON_SUN : ICON_MOON;
      localStorage.setItem('theme', next);
    });
    const app = document.getElementById('app') || document.querySelector('.app');
    if(app) app.appendChild(btn);
  }

  /* ---------- 启动 ---------- */
  function bootstrap(){
    try{
      initTheme();
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
