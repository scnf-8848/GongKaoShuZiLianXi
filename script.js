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
    'basic-config':'基本计算 · 配置',
    single:'单题练习',
    fixed:'固定题数练习',
    summary:'练习结算',
    history:'历史记录',
    'formula-menu':'公式计算',
    'formula-detail':'公式练习'
  };
  function go(view){
    $$('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
    $('#topbarTitle').textContent = titles[view]||'公考资料分析计算练习';
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
    return { op,a,b,answer,expr };
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
    if(single.paused){
      single.pauseStart = Date.now();
      btn.textContent = '继续';
      btn.classList.add('paused');
      inp.disabled = true;
      numpadKeys.forEach(k=>k.disabled = true);
      // 清除自动跳转（暂停时不应跳题）
      clearTimeout(single.autoNextTimer);
    } else {
      single.pausedTotal += Date.now() - single.pauseStart;
      btn.textContent = '暂停';
      btn.classList.remove('paused');
      inp.disabled = false;
      numpadKeys.forEach(k=>k.disabled = false);
      inp.focus();
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
    $('#singleInput').value = '';
    $('#singleInput').disabled = false;
    $$('.numpad-key').forEach(k=>k.disabled = false);
    $('#singleFeedback').className = 'feedback';
    $('#singleFeedback').textContent = '';
    $('#singleInput').focus();
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
    $('#singleInput').disabled = true;
    $$('.numpad-key').forEach(k=>k.disabled = true);
    // 查看答案计为错误
    single.questions.push({
      expr: single.cur.expr, answer: single.cur.answer,
      displayAnswer: display, errorPct: '-',
      user: '(查看答案)', correct: false,
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
      totalSec: (Date.now()-single.start)/1000
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

  function startFixed(){
    const n = cfg.count;
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
      item.innerHTML = `
        <span class="fi-idx">${i+1}</span>
        <span class="fi-expr">${q.expr} <span class="eq">=</span></span>
        <input class="fi-input" inputmode="numeric" autocomplete="off" data-i="${i}" placeholder="?" />
      `;
      list.appendChild(item);
    });
    list.addEventListener('input', onFixedInput);
    $('#fCount').textContent = n;
    fixed.timer = setInterval(tickFixed,200);
    go('fixed');
    // 自动聚焦第一题
    const first = $('.fi-input',list);
    if(first) first.focus();
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
    $('#fDone').textContent = fixed.questions.filter(q=>q.user!=='').length;
  }

  function tickFixed(){
    const total = (Date.now()-fixed.start)/1000;
    $('#fTotalTime').textContent = fmtTime(total);
    $('#fDone').textContent = fixed.questions.filter(q=>q.user!=='').length;
  }

  function submitFixed(){
    const totalSec = (Date.now()-fixed.start)/1000;
    const per = fixed.questions.length ? totalSec/fixed.questions.length : 0;
    fixed.questions.forEach(q=>{
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
      q.usedSec = per;
      q.userText = q.user==='' ? '未填' : q.user;
    });
    stopFixedTimers();
    showSummary({
      type:`固定题数（${fixed.questions.length}题）`,
      questions: fixed.questions,
      totalSec
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
  }

  /* ---------- 结算页 ---------- */
  let lastSummary = null;
  let lastConfigSnapshot = null;

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
    $('#sumCount').textContent = qs.length;
    $('#sumAcc').textContent = acc+'%';
    $('#sumTime').textContent = fmtTime(total);
    $('#sumAvg').textContent = avg.toFixed(1)+'s';

    const detail = $('#sumDetail');
    detail.innerHTML = '';
    qs.forEach((q,i)=>{
      const ok = q.correct;
      const row = document.createElement('div');
      row.className = 'detail-item ' + (ok?'ok':'err');
      const da = q.displayAnswer || String(q.answer);
      const ep = q.errorPct || '-';
      row.innerHTML = `
        <span class="di-idx">${i+1}</span>
        <span class="di-q">${q.expr} = ${da}</span>
        <span class="di-a ${ok?'ok':'err'}">${ok?'✔':('✘ '+(q.userText||q.user||'空'))}</span>
        <span class="di-t">${ep}</span>
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

  /* ---------- 公式计算（UI 占位） ---------- */
  const FORMULA_INFO = {
    base:{title:'求基期', formula:'基期量 = 现期量 ÷ (1 + 增长率)'},
    growth:{title:'求增长量', formula:'增长量 = 现期量 × 增长率 ÷ (1 + 增长率)'},
    percent:{title:'百化分练习', formula:'如 1/2=50%  1/3≈33.3%  1/4=25%  1/8=12.5%'},
    square:{title:'常见平方数', formula:'1² ~ 30² 速算记忆与练习'},
    rate:{title:'求增长率', formula:'增长率 = 增长量 ÷ 基期量'}
  };
  function openFormula(key){
    const info = FORMULA_INFO[key];
    $('#fdTitle').textContent = info.title;
    $('#fdFormula').textContent = info.formula;
    go('formula-detail');
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
    initSegs('cfgCount','count',true);

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
    $('#fixedEnd').addEventListener('click', abortFixed);

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
  }

  /* ---------- 启动 ---------- */
  function bootstrap(){
    try{
      bind();
      updateCfgTip();
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
