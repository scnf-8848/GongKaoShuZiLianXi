/* =========================================================
   基本计算：配置 + 出题 + 选项 + 判题 + 单题 / 固定题数
   ========================================================= */
(function(GK){
  'use strict';

  // 依赖（由前面加载的模块暴露到 GK）
  const {
    $, $$, bindSegTo, createFixedTimer, createSingleDrill, go, isTouchDevice, nowStr, rand, recordLaunch, registerStarter, registerStop, scheduleDraft, showSummary, st, tuneInput
  } = GK;

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

  // 「再来一次」：按快照还原配置，同步 UI 后启动（由注册表调用）
  function applyBasicCfg(config){
    Object.assign(cfg, config);
    // 同步基本计算 UI 选中态（兼容字符串/数字混合）
    ['cfgOps','cfgA','cfgB'].forEach((id,key)=>{
      const k = ['ops','aDigits','bDigits'][key];
      const parent = $('#'+id); if(!parent) return;
      $$('.chip',parent).forEach(c=>{
        c.classList.toggle('active', cfg[k].some(v=>String(v)===String(c.dataset.val)));
      });
    });
    bindSegTo('cfgMode', cfg.mode);
    const countWrap = $('#cfgCount');
    if(countWrap) $$('.seg',countWrap).forEach(s=>s.classList.toggle('active', +s.dataset.val===+cfg.count));
    bindSegTo('cfgAnswer', cfg.answer);
    const fixedWrap = $('#fixedCountWrap');
    if(fixedWrap) fixedWrap.style.display = cfg.mode==='fixed'?'':'none';
    if(cfg.mode==='single') startSingle(); else startFixed();
  }
  registerStarter('basic', applyBasicCfg);

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
  /* 按固定小数位四舍五入 */
  function roundTo(n, dec){
    const f = Math.pow(10, dec);
    return Math.round(n*f)/f;
  }
  /* 干扰项生成：始终按「相对偏差」生成，保证干扰项与正确项同量级。
     lo/hi：最小/最大比例偏差；
     gap：最小绝对间距（保证取整后不与正确项重合）；
     positiveOnly：只允许正数（除法不能出现负选项）；
     opts：累积选项数组（含正确项）。 */
  function genRatio(correct, dec, lo, hi, gap, positiveOnly, opts){
    const absC = Math.abs(correct);
    // 同量级约束：答案非 0 时不超过 5 倍；答案为 0 时给一个固定窗口，避免无解
    const limit = absC > 0 ? absC * 5 : gap * 10;
    const accept = w=>{
      if(!isFinite(w)) return false;
      if(positiveOnly && !(w > 0)) return false;          // 除法不出现 0 与负数
      if(Math.abs(w) > limit) return false;               // 同量级约束
      if(Math.abs(Math.abs(w) - absC) < gap - 1e-9) return false;  // 与正确项至少差一个 gap
      // 相对间距按「取整后」的实际值再校验一次：bias 的下限是在取整前判断的，
      // 取整可能把 70×1.045=73.15 变成 73，实际只有 4.29%，会让填空 2% 容差与选择判定打架
      if(absC > 0 && Math.abs(w - correct)/absC < lo - 1e-9) return false;
      // 干扰项彼此之间也要拉开，避免出现 80 / 81 这种几乎一样的两个错项
      if(opts.some(o=>Math.abs(o - w) < gap - 1e-9)) return false;
      return true;
    };
    // 第一轮：随机比例偏差
    let guard = 0;
    while(opts.length < 4 && guard < 400){
      guard++;
      const sign = Math.random() < 0.5 ? -1 : 1;
      const bias = (lo + Math.random()*(hi-lo)) * sign;
      const w = roundTo(correct * (1 + bias), dec);
      if(accept(w)) opts.push(w);
    }
    // 兜底：按固定步长向外扩展，保证一定能凑满 4 个
    guard = 0;
    while(opts.length < 4 && guard < 4000){
      const step = Math.floor(guard/2) + 1;
      const sign = guard % 2 ? 1 : -1;
      const w = roundTo(correct + sign*step*gap, dec);
      guard++;
      if(accept(w)) opts.push(w);
    }
    // 极端情况（如答案为 0 且窗口过窄）：允许放宽同量级约束补满
    guard = 1;
    while(opts.length < 4 && guard < 400){
      const sign = guard % 2 ? 1 : -1;
      const w = roundTo(correct + sign*guard*gap, dec);
      guard++;
      if(!isFinite(w)) continue;
      if(positiveOnly && !(w > 0)) continue;
      if(!opts.some(o=>Math.abs(o - w) < 1e-9)) opts.push(w);
    }
  }

  /* 选择题的显示精度：取满足以下两个条件的最小 0~6 位小数
     - 正确项与精确答案的相对误差 ≤0.15%（远小于 2% 容差，填空/选择判定一致）
     - 显示最小刻度 ≤ 答案的 4%（保证干扰项能以 ≥4.5% 的间距排布）
     例：1/7 → 0.143（3 位），0.04 → 0.040（3 位），16.6667 → 16.67（2 位） */
  function pickDecimals(answer){
    const mag = Math.abs(answer);
    for(let d=0; d<=6; d++){
      const errPct = mag ? Math.abs(roundTo(answer,d) - answer)/mag*100 : 0;
      const gridPct = mag ? Math.pow(10,-d)/mag*100 : 0;
      if(errPct <= 0.15 && gridPct <= 4) return d;
    }
    return 6;
  }

  /* 生成 4 个选项。
     正确项的显示精度按答案量级自适应（见 pickDecimals）：
       整数答案（加/减/乘）→ 0 位小数，选项都是整数，格式一致
       非整数答案（除）    → 2~6 位小数，答案越小精度越高（如 0.04 → 3 位）
     干扰项统一按 4.5%~12% 的相对偏差生成：
       - 干扰项与正确项始终同量级，避免出现“靠位数就能排除”的选项
       - 与填空模式 2% 的容差对齐：误差 ≤2% 的作答一定更靠近正确项
       - 除法不会生成 0 或负数选项 */
  function genOptions(q){
    const answer = q.answer;
    const dec = Number.isInteger(answer) ? 0 : pickDecimals(answer);  // 整数答案保持整数显示
    const correct = roundTo(answer, dec);   // 正确项
    const grid = Math.pow(10, -dec);        // 显示精度即最小刻度
    // 干扰项间距按 4.5% 取整到显示刻度，保证任何量级下都 ≥4.5%
    const gap = Math.max(1, Math.ceil(Math.abs(correct) * 0.045 / grid)) * grid;
    const opts = [correct];
    genRatio(correct, dec, 0.045, 0.12, gap, q.op === 'div', opts);
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
      // 减法统一「大数减小数」：否则两位数减五位数会出 -9873 这种结果，
      // 位数远超所配范围、且只剩借位凑数，没有训练价值
      if(a < b){ const t = a; a = b; b = t; }
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

  /* ---------- 单题练习：基本计算 ---------- */
  const single = {
    questions:[],      // 已完成题目记录 {expr,answer,user,correct,usedSec}
    cur:null,          // 当前题目对象
    curStart:0,        // 当前题开始时间戳
    start:0,           // 练习开始时间戳
    timer:null,
    autoNextTimer:null,
    autoNextPending:false, // 自动跳题被暂停打断，恢复后需补跳
    paused:false,      // 是否暂停中
    pauseStart:0,      // 暂停开始时间戳
    pausedTotal:0      // 累计暂停毫秒数
  };

  const singleDrill = createSingleDrill({
    state: single,
    view: 'single',
    ui: {
      pause:'#singlePause', input:'#singleInput', numpad:'#numpad', feedback:'#singleFeedback',
      time:'#sTotalTime', count:'#sCount', acc:'#sAcc', avg:'#sAvg', cur:'#sCur'
    },
    onStart(){
      st.lastPracticeSource = 'basic';
      recordLaunch('basic', cfg);
      // 意外退出保护：每答一题把已完成题目写入草稿
      st.activePractice = ()=>({
        type:'单题练习',
        time: nowStr(),
        launch: st.lastLaunch ? JSON.parse(JSON.stringify(st.lastLaunch)) : null,
        totalSec: ((single.paused ? single.pauseStart : Date.now()) - single.start - single.pausedTotal)/1000,
        questions: single.questions.map(q=>({
          expr:q.expr, answer:q.answer,
          displayAnswer: q.displayAnswer || String(q.answer),
          errorPct: q.errorPct || '-',
          user: q.userText!==undefined ? q.userText : (q.user||''),
          correct:q.correct, usedSec:q.usedSec
        }))
      });
    },
    makeQuestion(){ return genQuestion(); },
    renderQuestion(q, index){
      const isChoice = cfg.answer === 'choice';
      $('#singleIndex').textContent = `第 ${index} 题`;
      $('#singleExpr').textContent = q.expr + ' = ?';
      $('#singleChoice').style.display = isChoice ? '' : 'none';
      $('#singleChoiceHint').style.display = isChoice ? '' : 'none';
      $('#singleAnswerRow').style.display = isChoice ? 'none' : '';
      $('#numpad').style.display = isChoice ? 'none' : '';
      if(isChoice){
        renderSingleChoice();
      }else{
        const inp = $('#singleInput');
        inp.value = '';
        inp.disabled = false;
        tuneInput(inp, 'numeric');
        $$('.numpad-key').forEach(k=>k.disabled = false);
      }
      $('#singleFeedback').className = 'feedback';
      $('#singleFeedback').textContent = '';
      if(!isChoice && !isTouchDevice()) $('#singleInput').focus();
    },
    evaluate(raw, q){
      if(raw==='') return { invalid:'请输入答案' };
      const user = parseNum(raw);
      if(isNaN(user)) return { invalid:'请输入有效数字' };
      const r = checkAnswer(user, q);
      const exact = (r.errorPct === '-');
      const ok = r.correct;
      const text = ok
        ? (exact ? '✓ 正确' : `✓ 正确（答案：${r.displayAnswer}，误差 ${r.errorPct}）`)
        : (exact ? `✗ 错误，正确答案：${r.displayAnswer}` : `✗ 错误，正确答案：${r.displayAnswer}，误差 ${r.errorPct}`);
      return {
        cls: ok ? 'ok' : 'err', text, delay: ok ? 700 : 1200, correct: ok,
        info: { user, correct: ok, displayAnswer: r.displayAnswer, errorPct: r.errorPct }
      };
    },
    toRecord(q, info, usedSec){
      return {
        expr:q.expr, answer:q.answer, displayAnswer:info.displayAnswer,
        errorPct:info.errorPct, user:info.user, correct:info.correct, usedSec
      };
    },
    skipRecord(q, usedSec){
      return {
        expr:q.expr, answer:q.answer, displayAnswer:formatAnswer(q.answer),
        errorPct:'-', user:'', correct:false, usedSec
      };
    },
    reveal(q, usedSec){
      const display = formatAnswer(q.answer);
      return {
        text: `答案：${display}（点击"跳过"继续）`,
        record: {
          expr:q.expr, answer:q.answer, displayAnswer:display, errorPct:'-',
          userText:'(查看答案)', user:'', correct:false, usedSec
        }
      };
    },
    lockAfterAnswer(){
      if(cfg.answer === 'choice'){
        $$('.choice-btn', $('#singleChoice')).forEach(b=>b.disabled = true);
      }else{
        $('#singleInput').disabled = true;
        $$('.numpad-key').forEach(k=>k.disabled = true);
      }
    },
    lockExtra(paused){
      // 选择题按钮随暂停一起锁定；输入框与软键盘由引擎处理
      if(cfg.answer === 'choice'){
        $$('.choice-btn', $('#singleChoice')).forEach(b=>b.disabled = paused);
      }
    },
    summary(){
      return {
        type:'单题练习',
        questions: single.questions,
        totalSec: (Date.now() - single.start - single.pausedTotal)/1000,   // 扣除暂停时长，统计纯练习用时
        answerMode: cfg.answer
      };
    }
  });

  // 对外沿用原有函数名：事件绑定与其它模块无需感知内部重构
  function startSingle(){ singleDrill.start(); }
  function togglePause(){ singleDrill.togglePause(); }
  function nextSingle(isFirst){ singleDrill.next(isFirst); }
  function submitSingle(){ singleDrill.submit(); }
  function revealSingle(){ singleDrill.reveal(); }
  function endSingle(){ singleDrill.end(); }
  function stopSingleTimers(){ singleDrill.stop(); }

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
    singleDrill.commit({
      expr:q.expr, answer:q.answer,
      displayAnswer: q.options[q.correctIndex].text, errorPct:'-',
      userText: q.options[i].text, user: q.options[i].text, correct,
      usedSec
    }, correct ? 700 : 1200);
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
    questions:[],     // {expr,answer,user,correct,usedSec}
    start:0,
    timer:null,
    paused:false,
    pauseStart:0,
    pausedTotal:0
  };

  function fixedDoneCount(){
    return fixed.questions.filter(q=> q.user!==undefined && q.user!=='').length;
  }

  const fixedTimer = createFixedTimer({
    state: fixed,
    ui: { time:'#fTotalTime', pause:'#fixedPause' },
    onTick(){ $('#fDone').textContent = fixedDoneCount(); },
    // 暂停时锁住整个列表，避免暂停期间还能作答
    lock(paused){
      $$('.fi-input', $('#fixedList')).forEach(i=>i.disabled = paused);
      $$('.fi-opt', $('#fixedList')).forEach(b=>b.disabled = paused);
    }
  });

  function startFixed(){
    st.lastPracticeSource = 'basic';
    recordLaunch('basic', cfg);
    // 意外退出保护：已填写的题按当前作答批改后写入草稿
    const isChoiceCfg = cfg.answer === 'choice';
    st.activePractice = ()=>{
      const totalSec = fixedTimer.elapsedSec();
      const per = fixed.questions.length ? totalSec/fixed.questions.length : 0;
      const answered = fixed.questions.filter(q=>q.user!=='' && q.user!==undefined);
      return {
        type:`固定题数（${fixed.questions.length}题）`,
        time: nowStr(),
        launch: st.lastLaunch ? JSON.parse(JSON.stringify(st.lastLaunch)) : null,
        totalSec,
        questions: answered.map(q=>{
          const c = Object.assign({}, q);
          gradeBasicFixedQuestion(c, isChoiceCfg);
          return {
            expr:c.expr, answer:c.answer,
            displayAnswer:c.displayAnswer || String(c.answer),
            errorPct:c.errorPct || '-',
            user:c.userText, correct:c.correct, usedSec:per
          };
        })
      };
    };
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
    // 用 on* 赋值而非 addEventListener：每次开始练习都会重新渲染列表，
    // addEventListener 会不断累积监听器（一次按键触发 N 次落盘）
    list.oninput = onFixedInput;
    list.onclick = onFixedOpt;
    $('#fCount').textContent = n;
    $('#fixedChoiceHint').style.display = isChoice ? '' : 'none';
    fixedTimer.start();
    go('fixed');
    // 自动聚焦第一题（填空模式）
    if(!isChoice){
      const first = $('.fi-input',list);
      if(first) first.focus();
    }
  }

  function onFixedOpt(e){
    if(fixed.paused) return;   // 暂停中不接受作答（按钮已 disabled，这里再兜一层）
    const b = e.target.closest('.fi-opt'); if(!b) return;
    const i = +b.dataset.i;
    const oi = +b.dataset.oi;
    fixed.questions[i].user = oi;
    const item = b.closest('.fixed-item');
    $$('.fi-opt', item).forEach(x=>x.classList.remove('selected'));
    b.classList.add('selected');
    item.classList.add('done');
    $('#fDone').textContent = fixedDoneCount();
    scheduleDraft();
  }

  function onFixedInput(e){
    restrictNumericInput(e);
    const inp = e.target.closest('.fi-input'); if(!inp) return;
    const i = +inp.dataset.i;
    const item = inp.closest('.fixed-item');
    const val = inp.value.trim();
    fixed.questions[i].user = val;
    scheduleDraft();
    if(val===''){ item.classList.remove('done'); return; }
    item.classList.add('done');
    $('#fDone').textContent = fixedDoneCount();
  }

  // 批改固定题数中的单题（填空 / 选择）；正常提交与未完成草稿共用
  function gradeBasicFixedQuestion(q, isChoice){
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
      if(u !== null && !isNaN(u)){
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
  }

  function submitFixed(){
    const blank = fixed.questions.filter(q=> q.user===undefined || q.user==='').length;
    if(blank > 0 && !confirm(`还有 ${blank} 题未作答，确定直接结算？`)) return;
    const totalSec = fixedTimer.elapsedSec();   // 扣除暂停时长，统计纯练习用时
    const per = fixed.questions.length ? totalSec/fixed.questions.length : 0;
    const isChoice = cfg.answer === 'choice';
    fixed.questions.forEach(q=>{
      gradeBasicFixedQuestion(q, isChoice);
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

  function toggleFixedPause(){ fixedTimer.togglePause(); }

  function stopFixedTimers(){
    fixedTimer.stop();
  }

  // 交给核心的 stopAllTimers 统一调度（回首页时停表）
  registerStop(stopSingleTimers);
  registerStop(stopFixedTimers);

  /* ---------- 对外暴露 ---------- */
  Object.assign(GK, {
    cfg, chooseSingle, endSingle, genQuestion, initChips, initSegs, nextSingle, restrictNumericInput, revealSingle, single, startFixed, startSingle, submitFixed, submitSingle, toggleFixedPause, togglePause, updateCfgTip
  });
})(window.GK = window.GK || {});
