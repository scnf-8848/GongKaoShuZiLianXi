/* =========================================================
   公式计算：KaTeX 渲染 + 百化分 U 型图
   ========================================================= */
(function(GK){
  'use strict';

  // 依赖（由前面加载的模块暴露到 GK）
  const {
    $, go, onViewChange
  } = GK;

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
    right:[11,11.5,12,13,14,15,16,17,18,19,20,21,23,24,25,26,27,30,35,37,40,42,45,50] // 右臂（下→上）
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
      <svg class="bhf-svg" viewBox="0 0 ${VB} ${VBH}" preserveAspectRatio="xMidYMid meet">
        <path class="bhf-path" d="${D}" fill="none" stroke-width="10" stroke-linecap="round"/>
        <path class="bhf-bar" d="${D}" fill="none" stroke-width="2" stroke-linecap="round"/>
        <path class="bhf-dash" d="${D}" fill="none" stroke-width="1" stroke-dasharray="2 4" opacity=".5"/>
      </svg>
    `;
    // 去掉 formula-box 的大留白，给 SVG 腾出空间
    el.style.padding='4px'; el.style.margin='0 0 8px';
    el.style.minHeight='0';
    el.style.overflow='visible';
    el.style.position='relative';

    const svg = el.querySelector('.bhf-svg');
    const path = el.querySelector('.bhf-path');
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
      c.setAttribute('r',3.2);   // 颜色走 CSS（.bhf-ancg circle → var(--bhf-line)），跟随主题
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

    // 预采样路径点做最近点查找：mousemove 里逐个调用 getPointAtLength 太贵
    // （整条 U 型路径约 380 次/帧，低端机明显掉帧）
    const SAMPLES = 480;
    const lut = new Array(SAMPLES+1);
    for(let i=0;i<=SAMPLES;i++){
      const l = total*i/SAMPLES;
      const pt = path.getPointAtLength(l);
      lut[i] = { l, x:pt.x, y:pt.y };
    }

    let raf=null;
    function handle(e){
      if(raf) cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        const rect=svg.getBoundingClientRect();
        const x=(e.clientX-rect.left)*(VB/rect.width);
        const y=(e.clientY-rect.top)*(VBH/rect.height);
        let bestL=0, best=Infinity;
        for(let i=0;i<lut.length;i++){
          const p=lut[i];
          const dd=((p.x-x)*(p.x-x)+(p.y-y)*(p.y-y));
          if(dd<best){best=dd;bestL=p.l;}
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

  /* 百化分做题页：右侧图表的显示 / 隐藏（单题、固定题数各一套） */
  const BHF_CHART_IDS = [
    ['#bhfsChartPanel','#bhfsChartBody','#bhfsChartToggle'],
    ['#bhfChartPanel','#bhfChartBody','#bhfChartToggle']
  ];
  function closeBHFChart(){
    BHF_CHART_IDS.forEach(([p, b, t])=>{
      const panel = $(p); if(panel) panel.classList.remove('show');
      // 收起时把 SVG 一并清掉：下次展开会重新渲染，留着只会占内存
      const body = $(b); if(body) body.innerHTML = '';
      const btn = $(t); if(btn) btn.textContent = '显示图表';
    });
  }
  // 切到百化分以外的视图时收起 U 型图，避免下次进入残留展开状态
  onViewChange(view=>{ if(view!=='bhf-single' && view!=='bhf-fixed') closeBHFChart(); });
  function toggleBHFChart(panelSel, bodySel, btnSel){
    const panel = $(panelSel);
    const body = $(bodySel);
    const btn = $(btnSel);
    if(!panel || !body) return;
    const show = !panel.classList.contains('show');
    if(show){
      panel.classList.add('show');   // 先可见再渲染，保证 SVG 能取到路径长度
      renderBHF(body);
    }else{
      panel.classList.remove('show');
    }
    if(btn) btn.textContent = show ? '隐藏图表' : '显示图表';
  }

  function openFormula(key){
    const info = FORMULA_INFO[key];
    $('#fdTitle').textContent = info.title;
    const el = $('#fdFormula');
    // 每次都用全新的子容器承载内容：百化分 U 型图会写 padding/margin/minHeight 等内联样式，
    // 写在子容器上就不会污染公式框本身，也不必再逐个属性复位（漏一个就会塌成 4px padding）
    el.innerHTML = '';
    const body = document.createElement('div');
    body.className = 'fd-body';
    el.appendChild(body);
    // 平方数显示 11~30 平方数表（1~10 属常识，不再展示）
    if(key === 'square'){
      const cells = [];
      for(let i=11;i<=30;i++){
        cells.push(`<span><b>${i}<sup>2</sup></b><i>=${i*i}</i></span>`);
      }
      body.innerHTML = '<div class="square-table">'+cells.join('')+'</div>';
    }else if(key === 'percent'){
      // 百化分：U 型交互区
      renderBHF(body);
    }else{
      // 其他公式用 KaTeX 渲染
      if(window.katex){
        try{
          katex.render(info.formula, body, {displayMode:true, throwOnError:false});
        }catch(e){
          body.textContent = info.formula;
        }
      }else{
        body.textContent = info.formula;
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

  /* ---------- 对外暴露 ---------- */
  Object.assign(GK, {
    BHF_PRESET_ALL, closeBHFChart, openFormula, toggleBHFChart
  });
})(window.GK = window.GK || {});
