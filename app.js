'use strict';
//CORE-START
const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/-/g,' ').replace(/\s+/g,' ').trim();
const clean=s=>' '+norm(s).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()+' ';
const R=Math.round;

// ---------- Metas (mesma conta usada no chat) ----------
const AJUSTE={secar:-500,perder:-300,manter:0,ganhar:300};
const PROT_KG={secar:2.0,perder:1.8,manter:1.6,ganhar:1.8};
function calcMetas(p){
  const bmr=10*p.peso+6.25*p.alt-5*p.idade+(p.sexo==='M'?5:-161);
  const tdee=bmr*p.ativ;
  let kcal=Math.round((tdee+AJUSTE[p.obj])/10)*10;
  const minimo=p.sexo==='M'?1500:1200;
  const limitado=kcal<minimo; if(limitado)kcal=minimo;
  let prot=Math.round(p.peso*PROT_KG[p.obj]);
  const kAuto=kcal,pAuto=prot;
  if(p.kman>0)kcal=p.kman; if(p.pman>0)prot=p.pman;
  const gord=Math.round(p.peso*0.8);
  const carb=Math.max(0,Math.round((kcal-prot*4-gord*9)/4));
  return{bmr,tdee,kcal,prot,gord,carb,kAuto,pAuto,limitado,minimo};
}

// ---------- Entendimento das frases ----------
let FOODS=new Map(),LIST=[],ALIAS=[];
function setFoods(arr){FOODS=new Map(arr.map(f=>[f.id,f]));LIST=arr;arr.forEach(f=>f._n=clean(f.nome))}
function setAliases(arr){ALIAS=arr.filter(a=>FOODS.has(a.id)).map(a=>({a:norm(a.a),id:a.id,u:a.u||null}));ALIAS.sort((x,y)=>y.a.length-x.a.length)}
const NUMW={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,meio:0.5,meia:0.5};
const UNIT='(kg|gramas|grama|gr|g|ml|litros|litro|latas|lata|l|unidades|unidade|unid|un|colheres|colher|conchas|concha|fatias|fatia|scoops|scoop|copos|copo|potes|pote|x)';
const UNIT_G={colher:20,concha:140,fatia:25,copo:200,pote:170,lata:350,scoop:30};
const STOP=new Set('de do da dos das com sem e o a os as um uma no na ao em pra para meu minha comi comer tomei bebi hoje agora mais ainda so tambem tipo bem pouco gramas grama gr g kg ml un unidade unidades colher colheres concha conchas fatia fatias copo copos pote potes lata latas scoop scoops x'.split(' '));
function parseQty(c){
  let m=c.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:'+UNIT+'\\b)?'));
  if(m)return{n:parseFloat(m[1]),unit:m[2]||''};
  m=c.match(new RegExp('\\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|meio|meia)\\b\\s*(?:'+UNIT+'\\b)?'));
  if(m)return{n:NUMW[m[1]],unit:m[2]||''};
  return null;
}
function gramsFor(food,u,q){
  u=u||food.u||null;
  if(!q)return u;
  const n=q.n,un=q.unit;
  if(/^kg/.test(un))return n*1000;
  if(/^(g|gr|grama)/.test(un))return n;
  if(un==='ml')return n;
  if(/^lata/.test(un))return n*(u||350);
  if(/^(l|litro)/.test(un))return n*1000;
  for(const k of ['colher','concha','fatia','copo','pote','scoop'])if(un.startsWith(k))return n*((k==='fatia'&&u)?u:UNIT_G[k]);
  if(/^(un|unid|x)/.test(un))return u?n*u:null;
  if(u&&n<=20)return n*u;
  if(n>20)return n;
  return null;
}
function resolve(chunk){
  const p=clean(chunk);
  const toks=p.trim().split(' ').filter(t=>t.length>1&&!STOP.has(t)&&!/^\d/.test(t)&&!(t in NUMW));
  const al=ALIAS.find(a=>p.includes(' '+a.a+' '));
  if(!toks.length)return al?{food:FOODS.get(al.id),u:al.u}:null;
  const has=(n,t)=>n.includes(' '+t)||(t.length>3&&n.includes(' '+t.replace(/s$/,'')));
  const busca=ts=>LIST.filter(f=>ts.every(t=>has(f._n,t)));
  let c;
  if(al){
    const resto=toks.filter(t=>!(' '+al.a+' ').includes(' '+t+' '));
    if(!resto.length)return{food:FOODS.get(al.id),u:al.u};
    c=busca(toks);if(!c.length)c=busca(resto);
    if(!c.length)return{food:FOODS.get(al.id),u:al.u};
  }else c=busca(toks);
  if(!c.length)return{unknown:true,txt:toks.join(' ')};
  const pref=/(cozid|grelhad|assad|crua? )/;
  c.sort((a,b)=>{const pa=/cozid|grelhad|assad/.test(a._n)?0:1,pb=/cozid|grelhad|assad/.test(b._n)?0:1;return pa-pb||a.nome.length-b.nome.length});
  if(c.length===1)return{food:c[0]};
  return{amb:c.slice(0,6),key:toks.join(' ')};
}
function mk(food,g){const x=g/100;return{fid:food.id,nome:food.nome,g:Math.round(g),k:food.kcal*x,p:food.prot*x,c:food.carb*x,f:food.gord*x}}
function splitItems(text){return text.split(/,|;|\+|\n|\be\b|\bcom\b|\bmais\b|\btambem\b/).map(s=>s.trim()).filter(Boolean)}
function analisar(text){
  const ok=[],bad=[];
  for(const c of splitItems(text)){
    const res=resolve(c);if(!res)continue;
    const q=parseQty(c);
    if(res.unknown){bad.push({tipo:'desconhecido',c,txt:res.txt});continue}
    if(res.amb){bad.push({tipo:'ambiguo',c,q,cands:res.amb,key:res.key});continue}
    const g=gramsFor(res.food,res.u,q);
    if(g==null||!(g>0))bad.push({tipo:'qtd',c,food:res.food});else ok.push(mk(res.food,g));
  }
  return{ok,bad};
}
function prep(raw){return norm(raw).replace(/(\d),(\d)/g,'$1.$2').replace(/[?!]+/g,' ').replace(/\.+\s*$/,'').trim()}
function stripBody(t){
  return t.replace(/^(posso comer|posso tomar|posso beber|posso|pode|da pra comer|da para comer|da pra|da para|cabe|consigo comer|quanto tem( em)?|quantas calorias( tem)?( em)?|quanta proteina( tem)?( em)?|info|valor)\b/,' ')
   .replace(/\b(acabei de comer|acabei de|comi|almocei|jantei|lanchei|tomei|bebi|vou comer|quero comer)\b/g,' ')
   .replace(/\b(cafe da manha|pre treino|pos treino|no almoco|na janta|no jantar|no lanche|hoje|agora)\b/g,' ');
}
function soma(a){return a.reduce((t,e)=>({k:t.k+e.k,p:t.p+e.p,c:t.c+e.c,f:t.f+e.f}),{k:0,p:0,c:0,f:0})}
function intencao(t){
  if(/^(ajuda|help|comandos|como usa|\?)$/.test(t))return'ajuda';
  if(/\b(desfaz|desfazer)\b/.test(t)||(/\b(apaga|apagar|remove|remover|tira|tirar)\b/.test(t)&&/\bultim/.test(t)))return'desfazer';
  if(/\b(zerar|zera|novo dia|recomecar)\b/.test(t))return'zerar';
  if(/\b(o que (eu )?comi|historico|lista)\b/.test(t))return'lista';
  if(!/\d/.test(t)&&/\b(saldo|falta|faltam|resumo|como estou|como to|total|quanto comi|sobra|sobrou|metas?)\b/.test(t)&&!/\b(posso|da pra)\b/.test(t))return'saldo';
  if(/^(quanto tem|quantas calorias|quanta proteina|info|valor)\b/.test(t))return'info';
  if(/\b(posso|da pra|da para|cabe|consigo)\b/.test(t)||/^pode\b/.test(t))return'pergunta';
  return'registrar';
}
//CORE-END

// ---------- Banco de dados (IndexedDB) ----------
const idb={db:null,
  open(){return new Promise((res,rej)=>{const q=indexedDB.open('dietaTACO',1);
    q.onupgradeneeded=()=>{const d=q.result;d.createObjectStore('alimentos',{keyPath:'id'});const di=d.createObjectStore('diario',{keyPath:'id'});di.createIndex('dia','dia');d.createObjectStore('medidas',{keyPath:'dia'});d.createObjectStore('apelidos',{keyPath:'a'});d.createObjectStore('config',{keyPath:'k'})};
    q.onsuccess=()=>{this.db=q.result;res()};q.onerror=()=>rej(q.error)})},
  st(s,m){return this.db.transaction(s,m).objectStore(s)},
  rq(q){return new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})},
  all(s){return this.rq(this.st(s,'readonly').getAll())},
  get(s,k){return this.rq(this.st(s,'readonly').get(k))},
  put(s,v){return this.rq(this.st(s,'readwrite').put(v))},
  del(s,k){return this.rq(this.st(s,'readwrite').delete(k))},
  clear(s){return this.rq(this.st(s,'readwrite').clear())},
  dia(d){return this.rq(this.st('diario','readonly').index('dia').getAll(d))},
  putMany(s,arr){return new Promise((res,rej)=>{const t=this.db.transaction(s,'readwrite'),o=t.objectStore(s);arr.forEach(v=>o.put(v));t.oncomplete=res;t.onerror=()=>rej(t.error)})}
};
const cfg=async(k,d)=>{const v=await idb.get('config',k);return v?v.v:d};
const setCfg=(k,v)=>idb.put('config',{k,v});

// ---------- Estado ----------
let perfil=null,metas=null,hoje=[],diaAtual='';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const fmt=(n,d=1)=>(Math.round(n*10**d)/10**d).toLocaleString('pt-BR');
function diaKey(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
async function garantirDia(){const k=diaKey();if(k!==diaAtual){diaAtual=k;hoje=(await idb.dia(k)).sort((a,b)=>a.t-b.t)}}
const metaK=()=>metas?metas.kcal:2000, metaP=()=>metas?metas.prot:120;

async function carregarAlimentos(){
  if((await cfg('tacoVersao',0))<TACO_VERSAO){
    await idb.putMany('alimentos',TACO.map(([id,nome,g,kcal,prot,carb,gord,fibra])=>({id,nome,grupo:TACO_GRUPOS[g],kcal,prot,carb,gord,fibra,fonte:'TACO'})).concat(EXTRAS));
    await setCfg('tacoVersao',TACO_VERSAO);
  }
  setFoods(await idb.all('alimentos'));
  const aprendidos=await idb.all('apelidos');
  setAliases(APELIDOS.map(([a,id,u])=>({a,id,u})).concat(aprendidos));
}

// ---------- Cabeçalho ----------
function render(){
  const t=soma(hoje);
  $('#hname').textContent=perfil&&perfil.nome?'Dieta · '+perfil.nome:'Dieta TACO';
  $('#date').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
  $('#kTxt').textContent=R(t.k)+' / '+metaK()+' kcal';
  $('#pTxt').textContent=R(t.p)+' / '+metaP()+' g';
  const kb=$('#kBar');kb.style.width=Math.min(100,t.k/metaK()*100)+'%';kb.className=t.k>metaK()?'over':'';
  $('#pBar').style.width=Math.min(100,t.p/metaP()*100)+'%';
  $('#mini').textContent='Carboidrato '+R(t.c)+(metas?' / '+metas.carb:'')+' g · Gordura '+R(t.f)+(metas?' / '+metas.gord:'')+' g';
}

// ---------- Chat ----------
const chat=$('#chat');
function add(cls,html,buttons){
  const d=document.createElement('div');d.className='msg '+cls;d.innerHTML=html;
  if(buttons&&buttons.length){const b=document.createElement('div');b.className='btns';
    buttons.forEach(x=>{const bt=document.createElement('button');bt.textContent=x.label;if(x.pri)bt.className='pri';bt.onclick=()=>{b.remove();x.fn()};b.appendChild(bt)});d.appendChild(b)}
  chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d;
}
const bot=(h,b)=>add('bot',h,b);
const linha=e=>`<li>${esc(e.nome)} — ${e.g} g · <b>${R(e.k)}</b> kcal · ${R(e.p)} g prot</li>`;
function status(){
  const t=soma(hoje),rk=metaK()-R(t.k),rp=metaP()-R(t.p);
  return `<div class="s">Hoje: <b>${R(t.k)}</b> de ${metaK()} kcal (${rk>=0?'faltam '+rk:'<span class="no">passou '+(-rk)+'</span>'}) · Proteína <b>${R(t.p)}</b> de ${metaP()} g${rp>0?' (faltam '+rp+')':' ✔'}</div>`;
}
function tratarPendentes(bad,modo){
  for(const b of bad){
    if(b.tipo==='desconhecido')bot(`Não achei “${esc(b.c)}” na TACO. Procure na aba <b>Alimentos</b> ou cadastre lá com o rótulo.`);
    else if(b.tipo==='qtd')bot(`Quanto de <b>${esc(b.food.nome)}</b>? Ex.: “150g ${esc(b.c.replace(/[\d.,]+/g,'').trim())}”.`);
    else if(b.tipo==='ambiguo'){
      bot(`Qual desses é “${esc(b.c)}”?`,b.cands.map(f=>({label:f.nome+' ('+R(f.kcal)+' kcal)',fn:async()=>{
        await idb.put('apelidos',{a:b.key,id:f.id,u:null});setAliases(ALIAS.map(x=>({a:x.a,id:x.id,u:x.u})).concat([{a:b.key,id:f.id}]));
        const g=gramsFor(f,null,b.q);
        if(!g){bot(`Anotado: “${esc(b.key)}” = ${esc(f.nome)}. Agora me diga a quantidade, ex.: “150g ${esc(b.key)}”.`);return}
        executar(modo,[mk(f,g)],[]);
        bot(`<span class="s">Da próxima vez entendo “${esc(b.key)}” direto.</span>`);
      }})));
    }
  }
}
async function registrar(ok){
  await garantirDia();const t=Date.now();
  const novos=ok.map((e,i)=>Object.assign({id:t+'_'+i+'_'+Math.random().toString(36).slice(2,6),dia:diaAtual,t:t+i},e));
  for(const e of novos){await idb.put('diario',e);hoje.push(e)}
  render();return novos;
}
async function executar(modo,ok,bad){
  await garantirDia();
  if(ok.length){
    if(modo==='info')bot(ok.map(e=>`<div><b>${esc(e.nome)}</b> (${e.g} g): ${R(e.k)} kcal · P ${fmt(e.p)} g · C ${fmt(e.c)} g · G ${fmt(e.f)} g</div>`).join(''));
    else if(modo==='pergunta')perguntar(ok);
    else{const novos=await registrar(ok);const t=soma(ok);
      bot(`<div class="ok">Registrado ✔</div><ul>${ok.map(linha).join('')}</ul>`+(ok.length>1?`<div class="s">Refeição: ${R(t.k)} kcal · ${R(t.p)} g prot</div>`:'')+status(),
        [{label:'Desfazer',fn:()=>apagar(novos.map(n=>n.id))}]);}
  }
  tratarPendentes(bad,modo);
}
function perguntar(ok){
  const cur=soma(hoje),ad=soma(ok),depois=metaK()-(cur.k+ad.k),restaAgora=metaK()-cur.k,pDepois=metaP()-(cur.p+ad.p);
  let h=`<ul>${ok.map(linha).join('')}</ul>`;
  if(depois>=0)h+=`<div class="ok">✅ Pode sim.</div><div>Depois disso sobram <b>${R(depois)} kcal</b>${pDepois>0?` e ainda faltam <b>${R(pDepois)} g de proteína</b>`:' e a proteína do dia já está batida'}.</div>`;
  else if(depois>=-100)h+=`<div class="warn">⚠️ Dá, mas passa ${R(-depois)} kcal da meta.</div><div>Se puder, diminua um pouco a porção.</div>`;
  else{h+=`<div class="no">❌ Melhor não: passaria ${R(-depois)} kcal da meta.</div>`;
    if(restaAgora<=0)h+='<div>Você já bateu a meta de calorias de hoje.</div>';
    else if(ok.length===1){const kpg=ok[0].k/ok[0].g;if(kpg>0)h+=`<div>Cabem até uns <b>${Math.floor(restaAgora/kpg/5)*5} g</b> de ${esc(ok[0].nome)}.</div>`}
    else h+=`<div>Sobram só <b>${R(restaAgora)} kcal</b> hoje.</div>`;}
  const pRest=metaP()-cur.p;
  if(pRest>30&&ad.p/Math.max(ad.k,1)<0.05&&restaAgora>0)h+=`<div class="s">Dica: ainda faltam ${R(pRest)} g de proteína. Priorize frango, carne, ovos ou peixe.</div>`;
  bot(h,[{label:depois>=-100?'Comi! Registrar':'Registrar mesmo assim',pri:depois>=-100,fn:()=>executar('registrar',ok,[])}]);
}
async function apagar(ids){
  for(const id of ids){await idb.del('diario',id)}
  hoje=hoje.filter(e=>!ids.includes(e.id));render();bot('Removido.'+status());
}
function listar(){
  if(!hoje.length)return bot('Nada registrado hoje ainda.');
  const d=bot('<b>O que você comeu hoje</b><div class="lst"></div><div class="st"></div>');
  const l=d.querySelector('.lst');d.querySelector('.st').innerHTML=status();
  hoje.forEach(e=>{const it=document.createElement('div');it.className='item';
    it.innerHTML=`<span>${esc(e.nome)} — ${e.g} g · ${R(e.k)} kcal</span>`;
    const b=document.createElement('button');b.className='x';b.textContent='✕';
    b.onclick=async()=>{await idb.del('diario',e.id);hoje=hoje.filter(x=>x.id!==e.id);render();it.remove();d.querySelector('.st').innerHTML=status()};
    it.appendChild(b);l.appendChild(it)});
}
function ajuda(){
  bot(`<b>Como falar comigo</b><ul>
<li><b>comi 220g arroz, 140g feijão e 150g frango</b></li>
<li><b>2 ovos e 1 pão</b> · <b>3 colheres de arroz</b> · <b>1 concha de feijão</b></li>
<li><b>posso comer 100g de batata?</b></li>
<li><b>saldo</b>: quanto falta no dia</li>
<li><b>o que comi</b>: lista com botão para apagar</li>
<li><b>desfazer</b>: apaga o último registro</li>
<li><b>quanto tem 100g de abacate</b></li>
<li><b>zerar</b>: apaga o dia</li></ul>
<div class="s">Não sou uma IA: entendo frases simples. Se eu não souber qual alimento é, te mostro opções da TACO e aprendo sua escolha. Carne e frango sem a palavra “cru” contam como prontos (grelhados/cozidos).</div>`);
}
async function handle(raw){
  const t=prep(raw);if(!t)return;await garantirDia();
  if(!perfil)bot('<span class="s">Dica: preencha a aba Perfil para eu usar as suas metas.</span>');
  const it=intencao(t);
  if(it==='ajuda')return ajuda();
  if(it==='desfazer'){if(!hoje.length)return bot('Não há nada para desfazer hoje.');return apagar([hoje[hoje.length-1].id])}
  if(it==='zerar')return bot('Apagar tudo o que foi registrado hoje?',[{label:'Sim, zerar',pri:true,fn:()=>apagar(hoje.map(e=>e.id))},{label:'Cancelar',fn:()=>{}}]);
  if(it==='lista')return listar();
  if(it==='saldo')return bot(status()+`<div class="s">Carboidrato ${R(soma(hoje).c)} g · Gordura ${R(soma(hoje).f)} g</div>`);
  const {ok,bad}=analisar(stripBody(t));
  if(!ok.length&&!bad.length)return bot('Não entendi 🤔. Tente “comi 150g de arroz” ou toque em <b>Ajuda</b>.');
  executar(it,ok,bad);
}
function send(text){if(!text.trim())return;add('user',esc(text));handle(text)}
$('#f').addEventListener('submit',e=>{e.preventDefault();send($('#in').value);$('#in').value=''});
[['Saldo','saldo'],['O que comi','o que comi'],['Desfazer','desfazer'],['Ajuda','ajuda']].forEach(([l,c])=>{const b=document.createElement('button');b.textContent=l;b.onclick=()=>send(c);$('#chips').appendChild(b)});

// ---------- Abas ----------
function aba(v){document.querySelectorAll('section.view').forEach(s=>s.classList.toggle('on',s.id==='v-'+v));document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  if(v==='progresso')renderProgresso();if(v==='alimentos')buscar();}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>aba(b.dataset.v));

// ---------- Alimentos ----------
function buscar(){
  const q=clean($('#busca').value).trim();const lista=$('#lista');lista.innerHTML='';
  let r;
  if(!q){r=[];$('#buscaInfo').textContent=LIST.length+' alimentos no banco ('+LIST.filter(f=>f.fonte==='TACO').length+' da TACO). Digite para buscar.';return}
  const toks=q.split(' ');
  r=LIST.filter(f=>toks.every(t=>f._n.includes(' '+t)||f._n.includes(t))).sort((a,b)=>a.nome.length-b.nome.length).slice(0,60);
  $('#buscaInfo').textContent=r.length?r.length+(r.length===60?'+':'')+' resultados':'Nada encontrado.';
  r.forEach(f=>{const d=document.createElement('div');d.className='food';
    d.innerHTML=`<b>${esc(f.nome)}</b>${f.fonte!=='TACO'?`<span class="tag">${f.fonte}</span>`:''}<small>por 100 g: ${R(f.kcal)} kcal · P ${fmt(f.prot)} · C ${fmt(f.carb)} · G ${fmt(f.gord)} · Fibra ${fmt(f.fibra||0)}</small>`;
    d.onclick=()=>{if(d.querySelector('.panel'))return;const p=document.createElement('div');p.className='panel';
      p.innerHTML=`<label>Quantidade (g)</label><input inputmode="decimal" value="${f.u||100}"><div class="s calc" style="margin-top:6px"></div><div class="btns"><button class="pri reg">Registrar</button><button class="ask">Posso comer?</button>${f.fonte==='seu'?'<button class="del">Excluir</button>':''}</div>`;
      const inp=p.querySelector('input'),cl=p.querySelector('.calc');
      const up=()=>{const g=parseFloat(inp.value.replace(',','.'))||0,e=mk(f,g);cl.textContent=`${R(e.k)} kcal · ${fmt(e.p)} g prot`};up();inp.oninput=up;
      const go=m=>{const g=parseFloat(inp.value.replace(',','.'));if(!(g>0))return;aba('hoje');add('user',esc((m==='pergunta'?'posso comer ':'comi ')+g+'g de '+f.nome));executar(m,[mk(f,g)],[])};
      p.querySelector('.reg').onclick=e=>{e.stopPropagation();go('registrar')};
      p.querySelector('.ask').onclick=e=>{e.stopPropagation();go('pergunta')};
      const del=p.querySelector('.del');if(del)del.onclick=async e=>{e.stopPropagation();await idb.del('alimentos',f.id);await carregarAlimentos();buscar()};
      inp.onclick=e=>e.stopPropagation();d.appendChild(p);inp.focus();inp.select()};
    lista.appendChild(d)});
}
$('#busca').addEventListener('input',buscar);
$('#cSalvar').onclick=async()=>{
  const num=id=>parseFloat($(id).value.replace(',','.'));
  const nome=$('#cNome').value.trim(),k=num('#cK'),p=num('#cP')||0,c=num('#cC')||0,g=num('#cG')||0,u=num('#cU');
  if(!nome||!(k>=0)){alertMsg('Preencha pelo menos o nome e as kcal por 100 g.');return}
  const f={id:'c_'+Date.now(),nome,grupo:'Meus alimentos',kcal:k,prot:p,carb:c,gord:g,fibra:0,fonte:'seu'};if(u>0)f.u=u;
  await idb.put('alimentos',f);
  const ap=norm($('#cA').value||nome);await idb.put('apelidos',{a:ap,id:f.id,u:u>0?u:null});
  await carregarAlimentos();['#cNome','#cK','#cP','#cC','#cG','#cU','#cA'].forEach(i=>$(i).value='');
  $('#busca').value=nome;buscar();alertMsg('Alimento salvo. No chat, use “'+ap+'”.');
};
function alertMsg(t){const d=document.createElement('div');d.className='card';d.style.cssText='position:fixed;left:12px;right:12px;bottom:80px;z-index:9;max-width:600px;margin:auto';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}

// ---------- Perfil ----------
function lerPerfilForm(){const n=id=>parseFloat(String($(id).value).replace(',','.'));
  return{nome:$('#pNome').value.trim(),sexo:$('#pSexo').value,idade:n('#pIdade'),alt:n('#pAlt'),peso:n('#pPeso'),ativ:parseFloat($('#pAtiv').value),obj:$('#pObj').value,kman:n('#pKman')||0,pman:n('#pPman')||0}}
function preencherPerfil(p){$('#pNome').value=p.nome||'';$('#pSexo').value=p.sexo;$('#pIdade').value=p.idade;$('#pAlt').value=p.alt;$('#pPeso').value=p.peso;$('#pAtiv').value=String(p.ativ);$('#pObj').value=p.obj;$('#pKman').value=p.kman||'';$('#pPman').value=p.pman||''}
function mostrarCalc(){
  const el=$('#calc');if(!perfil){el.style.display='none';return}el.style.display='';
  const m=metas,p=perfil;
  el.innerHTML=`<h3>Suas metas diárias</h3>
  <div class="res"><span>Calorias</span><span class="big">${m.kcal} kcal</span></div>
  <div class="res"><span>Proteína</span><b>${m.prot} g</b></div>
  <div class="res"><span>Gordura (mín.)</span><span>${m.gord} g</span></div>
  <div class="res"><span>Carboidrato (resto)</span><span>${m.carb} g</span></div>
  <h3 style="margin-top:14px">Como calculei</h3>
  <div class="res"><span>Gasto em repouso (Mifflin-St Jeor)</span><span>${R(m.bmr)} kcal</span></div>
  <div class="s">10 × ${p.peso} kg + 6,25 × ${p.alt} cm − 5 × ${p.idade} anos ${p.sexo==='M'?'+ 5':'− 161'}</div>
  <div class="res"><span>× fator de atividade ${String(p.ativ).replace('.',',')}</span><span>${R(m.tdee)} kcal</span></div>
  <div class="res"><span>Ajuste do objetivo</span><span>${AJUSTE[p.obj]>0?'+':''}${AJUSTE[p.obj]} kcal</span></div>
  ${m.limitado?`<div class="s warn">Ajustei para o mínimo de ${m.minimo} kcal, para não ficar baixo demais.</div>`:''}
  ${p.kman?`<div class="s">Usando sua meta manual de calorias (automático seria ${m.kAuto}).</div>`:''}
  <div class="res"><span>Proteína: ${String(PROT_KG[p.obj]).replace('.',',')} g × ${p.peso} kg</span><span>${m.pAuto} g</span></div>
  ${p.pman?`<div class="s">Usando sua meta manual de proteína.</div>`:''}
  <div class="s" style="margin-top:8px">Pese a média semanal: se em 2 semanas o peso não cair (objetivo secar), reduza uns 150 kcal na meta manual.</div>`;
}
$('#pSalvar').onclick=async()=>{
  const p=lerPerfilForm();
  if(!(p.idade>10&&p.idade<100&&p.alt>120&&p.alt<230&&p.peso>30&&p.peso<300)){alertMsg('Confira idade, altura (cm) e peso (kg).');return}
  perfil=p;metas=calcMetas(p);await setCfg('perfil',p);mostrarCalc();render();$('#boasvindas').style.display='none';alertMsg('Perfil salvo! Meta: '+metas.kcal+' kcal e '+metas.prot+' g de proteína.');
};

// ---------- Progresso ----------
$('#mDia').value=diaKey();
$('#mSalvar').onclick=async()=>{
  const n=id=>{const v=parseFloat($(id).value.replace(',','.'));return v>0?v:null};
  const m={dia:$('#mDia').value||diaKey(),peso:n('#mPeso'),abd:n('#mAbd'),braco:n('#mBraco'),peito:n('#mPeito'),quad:n('#mQuad')};
  if(!m.peso&&!m.abd&&!m.braco&&!m.peito&&!m.quad){alertMsg('Preencha pelo menos uma medida.');return}
  const old=await idb.get('medidas',m.dia);if(old)for(const k in m)if(m[k]==null&&old[k]!=null)m[k]=old[k];
  await idb.put('medidas',m);['#mPeso','#mAbd','#mBraco','#mPeito','#mQuad'].forEach(i=>$(i).value='');
  const todas=(await idb.all('medidas')).filter(x=>x.peso).sort((a,b)=>a.dia<b.dia?-1:1);
  if(perfil&&todas.length&&todas[todas.length-1].dia===m.dia&&m.peso){perfil.peso=m.peso;metas=calcMetas(perfil);await setCfg('perfil',perfil);preencherPerfil(perfil);mostrarCalc();render();alertMsg('Salvo! Metas atualizadas: '+metas.kcal+' kcal, '+metas.prot+' g prot.')}
  else alertMsg('Medidas salvas.');
  renderProgresso();
};
async function renderProgresso(){
  const ms=(await idb.all('medidas')).sort((a,b)=>a.dia<b.dia?-1:1);
  const br=d=>d.split('-').reverse().slice(0,2).join('/');
  const ps=ms.filter(x=>x.peso);
  const g=$('#grafico');
  if(ps.length<2)g.innerHTML='<div class="s">Registre o peso em pelo menos 2 dias para ver o gráfico.</div>';
  else{const W=320,H=150,pl=34,pr=8,pt=10,pb=22;const vs=ps.map(x=>x.peso),mn=Math.min(...vs)-0.5,mx=Math.max(...vs)+0.5;
    const X=i=>pl+(W-pl-pr)*i/(ps.length-1),Y=v=>pt+(H-pt-pb)*(mx-v)/(mx-mn);
    const pts=ps.map((x,i)=>X(i).toFixed(1)+','+Y(x.peso).toFixed(1)).join(' ');
    let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Gráfico de peso">`;
    [mx-0.5,(mx+mn)/2,mn+0.5].forEach(v=>{s+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/><text x="2" y="${Y(v)+3}">${fmt(v)}</text>`});
    s+=`<polyline points="${pts}" fill="none" stroke="#1f8a5b" stroke-width="2.5" stroke-linejoin="round"/>`;
    ps.forEach((x,i)=>{s+=`<circle cx="${X(i)}" cy="${Y(x.peso)}" r="3" fill="#1f8a5b"/>`});
    s+=`<text x="${pl}" y="${H-6}">${br(ps[0].dia)}</text><text x="${W-pr}" y="${H-6}" text-anchor="end">${br(ps[ps.length-1].dia)}</text></svg>`;
    const dif=ps[ps.length-1].peso-ps[0].peso;
    g.innerHTML=s+`<div class="s">Variação desde ${br(ps[0].dia)}: <b>${dif>0?'+':''}${fmt(dif)} kg</b></div>`;}
  const h=$('#hist');
  if(!ms.length)h.innerHTML='<div class="s">Nenhuma medida ainda.</div>';
  else{h.innerHTML='';ms.slice().reverse().forEach(x=>{const d=document.createElement('div');d.className='item';
    const v=[x.peso&&fmt(x.peso)+' kg',x.abd&&'abd '+fmt(x.abd),x.braco&&'braço '+fmt(x.braco),x.peito&&'peito '+fmt(x.peito),x.quad&&'quadril '+fmt(x.quad)].filter(Boolean).join(' · ');
    d.innerHTML=`<span><b>${br(x.dia)}</b> ${v}</span>`;const b=document.createElement('button');b.className='x';b.textContent='✕';
    b.onclick=async()=>{await idb.del('medidas',x.dia);renderProgresso()};d.appendChild(b);h.appendChild(d)})}
  const all=await idb.all('diario');const por={};all.forEach(e=>{por[e.dia]=por[e.dia]||{k:0,p:0};por[e.dia].k+=e.k;por[e.dia].p+=e.p});
  const dl=$('#dias');let s='';
  for(let i=0;i<14;i++){const d=new Date();d.setDate(d.getDate()-i);const k=diaKey(d),v=por[k];if(!v)continue;
    const pc=Math.min(100,v.k/metaK()*100);
    s+=`<div style="margin:6px 0"><div class="row" style="margin:0"><span>${br(k)}</span><span>${R(v.k)} kcal · ${R(v.p)} g prot</span></div><div class="bar"><i style="width:${pc}%" class="${v.k>metaK()?'over':''}"></i></div></div>`}
  dl.innerHTML=s||'<div class="s">Ainda sem registros.</div>';
}

// ---------- Backup ----------
$('#exp').onclick=async()=>{
  const data={app:'dietaTACO',v:1,exportado:new Date().toISOString(),perfil,diario:await idb.all('diario'),medidas:await idb.all('medidas'),apelidos:await idb.all('apelidos'),meus:(await idb.all('alimentos')).filter(f=>f.fonte==='seu')};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='dieta-backup-'+diaKey()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
};
$('#impB').onclick=()=>$('#imp').click();
$('#imp').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{const d=JSON.parse(await f.text());if(d.app!=='dietaTACO')throw 0;
    if(d.perfil){perfil=d.perfil;await setCfg('perfil',perfil);metas=calcMetas(perfil);preencherPerfil(perfil)}
    await idb.putMany('diario',d.diario||[]);await idb.putMany('medidas',d.medidas||[]);await idb.putMany('alimentos',d.meus||[]);await idb.putMany('apelidos',d.apelidos||[]);
    await carregarAlimentos();diaAtual='';await garantirDia();render();mostrarCalc();alertMsg('Backup importado!');
  }catch(err){alertMsg('Arquivo de backup inválido.')}
  e.target.value='';
};

// ---------- Início ----------
(async()=>{
  try{await idb.open()}catch(e){bot('Não consegui abrir o banco de dados deste navegador. Tente abrir o app fora do modo anônimo.');return}
  await carregarAlimentos();
  perfil=await cfg('perfil',null);
  if(perfil){metas=calcMetas(perfil);preencherPerfil(perfil)}
  mostrarCalc();await garantirDia();render();
  bot(`Oi${perfil&&perfil.nome?', '+esc(perfil.nome):''}! Me diga o que você comeu, por exemplo <b>comi 150g de arroz e 2 ovos</b>, ou pergunte <b>posso comer 100g de pão?</b>`+status());
  if(!perfil){$('#boasvindas').style.display='';aba('perfil')}
  if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
  document.addEventListener('visibilitychange',async()=>{if(!document.hidden){await garantirDia();render()}});
})();
