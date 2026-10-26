/* =========================================================
   入口：事件绑定 + 启动
   ========================================================= */
(function(GK){
  'use strict';

  // 依赖（由前面加载的模块暴露到 GK）。本文件是唯一的聚合层，故依赖最多，
  // 按来源模块分组，方便对照"这个事件到底该由谁处理"。
  const {
    // core
    $, $$, st, go, initTheme,
    // store / summary
    LS_KEY, checkpointDraft, renderHistory, renderSummaryDetails, refreshSumFilter, launchPractice,
    // formula
    openFormula, toggleBHFChart,
    // drills/basic
    cfg, single, genQuestion, initChips, initSegs, restrictNumericInput,
    startSingle, togglePause, nextSingle, submitSingle, revealSingle, endSingle, chooseSingle,
    startFixed, submitFixed, toggleFixedPause,
    // drills/square
    squareCfg, sqSingle, initSquareChips, updateSquareTip,
    startSquareSingle, toggleSqPause, nextSqSingle, submitSqSingle, revealSqSingle, endSqSingle,
    startSquareFixed, submitSqFixed, toggleSqFixedPause,
    // drills/bhf
    bhfCfg, bhfSingle, bhfSanitize, initBHFChips, updateBHFConfigTip,
    startBHFHandSingle, toggleBHFHandPause, nextBHFHandSingle, submitBHFHandSingle,
    revealBHFHandSingle, endBHFHandSingle, startBHFHandFixed, submitBHFHandFixed, toggleBHFHandFixedPause
  } = GK;

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
      tip.style.color = (isErr === false) ? 'var(--muted)' : 'var(--err)';   // 默认为错误提示
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
    $('#fixedPause').addEventListener('click', toggleFixedPause);
    $('#fixedConfirm').addEventListener('click', submitFixed);
    $('#fixedEnd').addEventListener('click', submitFixed);

    // 结算页返回按钮
    $('#sumBack').addEventListener('click', ()=>{
      if(st.summaryFromHistory){ go('history'); return; }   // 历史回看 → 返回历史列表
      if(st.lastPracticeSource === 'square') openFormula('square');
      else if(st.lastPracticeSource === 'bhf') openFormula('percent');
      else go('basic-config');
    });

    // 结算明细筛选
    (function(){
      const wrap = $('#sumFilter');
      if(!wrap) return;
      wrap.addEventListener('click', e=>{
        const b = e.target.closest('.seg'); if(!b) return;
        st.summaryFilter = b.dataset.f;
        refreshSumFilter();
        renderSummaryDetails();
      });
    })();

    // 结算页再来一次（按当前结算的启动描述重跑：正常练习用最近一次，历史回看用记录里的 launch）
    $('#sumAgain').addEventListener('click', ()=>{
      if(!st.activeLaunch){ go('home'); return; }
      try{
        launchPractice(st.activeLaunch.source, st.activeLaunch.config);
      }catch(err){
        console.error(err);
        alert(err && err.message ? err.message : '练习配置失效');
      }
    });

    // 清空历史
    $('#clearHistory').addEventListener('click', ()=>{
      if(!confirm('确定清空全部历史记录？此操作不可恢复。')) return;
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
    $('#sqfPause').addEventListener('click', toggleSqFixedPause);
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
    $('#bhfsChartToggle').addEventListener('click', ()=>toggleBHFChart('#bhfsChartPanel','#bhfsChartBody','#bhfsChartToggle'));
    $('#bhfChartToggle').addEventListener('click', ()=>toggleBHFChart('#bhfChartPanel','#bhfChartBody','#bhfChartToggle'));
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
    $('#bhfPause').addEventListener('click', toggleBHFHandFixedPause);
    $('#bhfConfirm').addEventListener('click', submitBHFHandFixed);
    $('#bhfEnd').addEventListener('click', submitBHFHandFixed);
  }

  /* ---------- 启动 ---------- */
  // 拆分后各模块通过 GK 共享：某个 js 没加载或顺序被调换时，症状会是
  // "某函数未定义"，且往往要走到那个功能才报错。这里提前统一检查一遍。
  const REQUIRED_ON_GK = [
    '$','$$','go','st','onEnter','initTheme',
    'saveRecord','checkpointDraft','scheduleDraft','showSummary','recordLaunch',
    'createSingleDrill','createFixedTimer','openFormula','closeBHFChart','BHF_PRESET_ALL',
    'cfg','single','startSingle','submitSingle','startFixed','submitFixed',
    'squareCfg','sqSingle','startSquareSingle','submitSqFixed',
    'bhfCfg','bhfSingle','startBHFHandSingle','submitBHFHandFixed','bhfSanitize'
  ];
  function assertModules(){
    const missing = REQUIRED_ON_GK.filter(k=>GK[k]===undefined);
    if(missing.length) throw new Error('模块未正确加载，缺少：' + missing.join('、'));
  }

  function bootstrap(){
    try{
      assertModules();
      initTheme();
      bind();
      // 意外退出保护：页面隐藏或卸载时落盘当前练习草稿
      window.addEventListener('pagehide', checkpointDraft);
      document.addEventListener('visibilitychange', ()=>{
        if(document.visibilityState === 'hidden') checkpointDraft();
      });
      // 提示文案由各配置页自己维护：首屏不预渲染「请至少选择一种运算」这类红字，
      // 进入配置页时 go() 会清空，用户操作或点开始时才提示
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
})(window.GK = window.GK || {});
