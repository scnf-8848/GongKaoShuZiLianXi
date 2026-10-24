/* =========================================================
   核心：通用工具 / 共享状态 / 模块注册表 / 视图路由 / 主题
   ========================================================= */
(function(GK){
  'use strict';

  /* ---------- 通用工具 ---------- */
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const rand = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;
  const LS_KEY = 'gk_calc_records_v1';
  const LS_DRAFT = 'gk_calc_draft_v1';   // 进行中练习的草稿（意外退出后恢复用）
  /* 是否触屏设备。
     只看 maxTouchPoints：'ontouchstart' in window 在部分桌面浏览器（以及 jsdom）里恒为真，
     用它判断会把普通桌面机也当成触屏，进而误关系统键盘。 */
  const isTouchDevice = ()=>(navigator.maxTouchPoints || 0) > 0;

  /* 单题练习的输入框：触屏设备用页面自带的数字键盘，因此把系统软键盘关掉（inputmode=none）。
     旧实现是设 readOnly，连触屏笔记本的物理键盘也一起锁死了；inputmode 只影响虚拟键盘，
     物理键盘照常输入。 */
  function tuneInput(inp, mode){
    if(!inp) return;
    inp.setAttribute('inputmode', isTouchDevice() ? 'none' : (mode || 'numeric'));
  }

  function fmtTime(sec){
    if(!isFinite(sec)) sec = 0;
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

  /* ---------- 共享状态 ----------
     跨模块读写的可变值统一放在这里：原先是各自文件里的 let，拆成多个文件后
     无法靠闭包共享，改成对象属性（引用唯一）才不会出现"各存一份"的错。 */
  const st = {
    lastSummary:null,          // 当前结算数据，供明细筛选复用
    lastLaunch:null,           // 最近一次真实练习的启动描述 {source, config}
    activeLaunch:null,         // 结算页"再来一次"使用的启动描述
    lastPracticeSource:'basic',// 最近一次练习来源，决定"没记录"时跳哪个公式页
    summaryFromHistory:false,  // 当前结算是否为历史回看（决定"返回"去向）
    summaryFilter:'all',       // all | ok | warn | err
    activePractice:null,       // 进行中练习的快照器，供草稿落盘
    draftTimer:null            // 草稿落盘的合并定时器
  };

  /* ---------- 模块注册表 ----------
     各练习模块在自己文件里注册生命周期的入口，核心只按序调用。
     这样既避免模块之间互相 require（循环依赖），也不用在核心硬编码
     "要停哪几个定时器""再来一次该启动谁"。 */
  const registry = {
    enter:{},      // view -> [fn]   进入某视图时依次执行
    viewChange:[], // fn(view)      每次切换视图后执行
    starters:{},   // source -> fn  "再来一次"：恢复配置并启动对应练习
    stops:[]       // fn            清理各自的计时器
  };
  function onEnter(view, fn){
    (registry.enter[view] = registry.enter[view] || []).push(fn);
  }
  function onViewChange(fn){ registry.viewChange.push(fn); }
  function registerStarter(source, fn){ registry.starters[source] = fn; }
  function registerStop(fn){ registry.stops.push(fn); }
  function stopAllTimers(){ registry.stops.forEach(fn=>fn()); }
  onEnter('home', stopAllTimers);   // 回首页 = 结束一切进行中的计时

  // 通用：把某个 seg 组的高亮设为指定值（供各模块同步配置 UI）
  function bindSegTo(id, val){
    const wrap = $('#'+id); if(!wrap) return;
    $$('.seg',wrap).forEach(s=>s.classList.toggle('active', String(s.dataset.val)===String(val)));
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
    if(view==='basic-config'){ const t = $('#cfgTip'); if(t) t.textContent = ''; }  // 未操作前不显示红色提示
    // 视图进入钩子（由各模块注册：history 渲染、home 停表+落盘草稿…）
    const hooks = registry.enter[view];
    if(hooks) hooks.forEach(fn=>fn());
    // 视图切换后的通用钩子（如离开百化分时收起 U 型图）
    registry.viewChange.forEach(fn=>fn(view));
  }

  /* ---------- 暗色主题 ---------- */
  function initTheme(){
    let saved = null;
    try{ saved = localStorage.getItem('theme'); }catch(e){ saved = null; }   // 隐私模式/禁用存储时不应影响启动
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
      try{ localStorage.setItem('theme', next); }catch(e){}
    });
    const app = document.getElementById('app') || document.querySelector('.app');
    if(app) app.appendChild(btn);
  }

  /* ---------- 对外暴露 ---------- */
  Object.assign(GK, {
    $, $$, LS_DRAFT, LS_KEY, bindSegTo, fmtTime, go, initTheme, isTouchDevice, nowStr, onEnter, onViewChange, rand, registerStarter, registerStop, registry, st, tuneInput
  });
})(window.GK = window.GK || {});
