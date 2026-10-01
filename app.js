const DECKS=window.DIXIT_DECKS||{};
const $=s=>document.querySelector(s), app=$('#app');
const COMMON_PLAYER_NAME_KEY='boardgamePlayerName';
let localPick={key:'',card:null,votes:[]};
let ws=null,state=null,roomState=null,me=localStorage.getItem(COMMON_PLAYER_NAME_KEY)||localStorage.getItem('boardgame-player-name')||localStorage.getItem('boardgame_player_name')||'',room='',rooms=[],intentionalClose=false,roomTimer=null,reconnectTimer=null;
const WORKER_URL=localStorage.getItem('dixit_worker_url')||'https://dixit-online.naitoryo7110.workers.dev';
function parseCard(id){let m=id.match(/^(DIXIT_\d+)_(\d{3})$/);return m?{deck:m[1],num:m[2]}:null}
function img(id){let c=parseCard(id);return c?`cards/${c.deck}/${id}.webp`:''}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function progressLabel(){if(!state)return '';let s=state.settings||roomState?.settings||{};return s.endType==='round'?`${state.round}/${s.target}`:`${s.target}点で勝ち`}
function renderTopBar(inRoom=false,host=false){return `<div class=top><div class=brand>DIXIT ONLINE</div>${inRoom?`<div class=topProgress>${esc(progressLabel())}</div><div class=topActions>${host&&state?'<button class="btn secondary compact" id=resetLobby>ロビーへ戻る</button>':''}<button class="btn secondary compact" id=leave>退出</button><span class=versionLabel>v0.4.3.8</span></div>`:`<div class=topActions><span class=versionLabel>v0.4.3.8</span></div>`}</div>`}
async function fetchRooms(){let r=await fetch(`${WORKER_URL}/rooms`,{cache:'no-store'});let d=await r.json();if(!r.ok)throw Error(d.error||'ROOM情報を取得できません');return d.rooms||[]}
function tokenKey(id){return `dixit-online-token-${id}`}
function getToken(id){let t=localStorage.getItem(tokenKey(id));if(!t){t=crypto.randomUUID().replaceAll('-','');localStorage.setItem(tokenKey(id),t)}return t}
function statusLabel(r){return r.status==='playing'?'ゲーム中':r.status==='finished'?'終了':'待機中'}
function renderHome(){document.body.className='screen-home';let cards=[1,2,3,4].map(n=>{let id=`room${n}`,r=rooms.find(x=>x.id===id)||{status:'lobby',players:0,maxPlayers:10,participants:[],connectedHumans:0};let reconnect=!!localStorage.getItem(tokenKey(id))&&r.status!=='lobby';let join=r.status==='lobby'&&r.players<10;return `<div class="panel roomCard"><div class=row><h2>ROOM ${n}</h2><span class=grow></span><b>${statusLabel(r)}</b></div><div>${r.players}/${r.maxPlayers}人</div><small>参加者：${(r.participants||[]).map(esc).join('、')||'なし'}</small><button class=btn data-join="${id}" ${join||reconnect?'':'disabled'}>${reconnect?'再接続':join?'参加する':'参加不可'}</button><button class="btn secondary" data-reset="${id}" ${r.connectedHumans===0?'':'disabled'}>${r.connectedHumans===0?'初期化':'接続者あり'}</button></div>`}).join('');app.innerHTML=renderTopBar()+`<div class="wrap onlineHome"><div class=panel><h2>プレイヤー名</h2><input id=name value="${esc(me)}" maxlength=18 placeholder="名前を入力"></div><div class=rooms>${cards}</div></div>`;document.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>connectRoom(b.dataset.join));document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>resetRoom(b.dataset.reset))}
async function home(){intentionalClose=true;if(ws){try{ws.close()}catch{}}ws=null;state=null;roomState=null;room='';clearTimeout(reconnectTimer);clearTimeout(roomTimer);rooms=[];renderHome();try{rooms=await Promise.race([fetchRooms(),new Promise((_,reject)=>setTimeout(()=>reject(Error('ROOM取得タイムアウト')),3000))]);renderHome()}catch(e){console.warn(e)}}
function save(){me=$('#name')?.value.trim()||me;if(!me)return false;localStorage.setItem(COMMON_PLAYER_NAME_KEY,me);localStorage.setItem('boardgame-player-name',me);localStorage.setItem('boardgame_player_name',me);return true}
async function resetRoom(id){if(!confirm(`${id.replace('room','ROOM ')} を初期化しますか？`))return;let r=await fetch(`${WORKER_URL}/rooms/${id}/reset-empty`,{method:'POST'}),d=await r.json();if(!r.ok)return alert(d.error||'初期化できません');home()}
async function connectRoom(id){if(!save())return alert('名前を入力してください');clearTimeout(roomTimer);room=id;intentionalClose=false;let token=getToken(id);let chk=await fetch(`${WORKER_URL}/rooms/${id}/join-check?token=${encodeURIComponent(token)}&name=${encodeURIComponent(me)}`),info=await chk.json();if(!chk.ok){room='';return alert(info.error)}let url=WORKER_URL.replace(/^http/,'ws')+`/ws/${id}?token=${encodeURIComponent(token)}&name=${encodeURIComponent(me)}`;ws=new WebSocket(url);ws.onopen=()=>{};ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.type==='state'){roomState=m.room;state=m.game;render()}else if(m.type==='error')alert(m.message)};ws.onclose=()=>{if(!intentionalClose&&room){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>connectRoom(room),1500)}}}
function send(type,data={}){if(ws?.readyState===1)ws.send(JSON.stringify({type,...data}))}
function playerStrip(){let ps=state?.players||roomState?.players||[];let showGain=state?.phase==='result';return `<div class=playerStrip>${ps.map(x=>{let gp=state?.players?.find(p=>p.name===x.name);let score=gp?.score??0;let gain=gp?.roundGain??0;let statusClass=state&&x.name===state.storyteller?' storyteller':state&&state.phase==='vote'&&gp?.voteDone?' voted':'';return `<div class=playerSlot><div class="playerBox${statusClass}"><div class=playerName>${esc(x.name)}${x.isCpu?' 🤖':x.isHost?' 👑':''}${x.connected===false?' (切断)':''}</div><div class=playerScore>${score}点</div></div>${showGain?`<div class=roundGain>+${gain}点</div>`:''}</div>`}).join('')}</div>`}
function render(){if(!roomState)return;let host=roomState.isHost;if(!state){document.body.className='screen-lobby';app.innerHTML=renderTopBar(true,host)+`<div class=desktopRoomShell><aside class=playerSidebar>${playerStrip()}</aside><main class="wrap gameBoard lobbyBoard">${lobby(host)}</main></div>`;$('#leave').onclick=leaveRoom;bind(host,null);return}let p=state.players.find(x=>x.name===me);document.body.className=(state.phase==='result'||state.phase==='final')?'screen-result':'screen-playing';app.innerHTML=renderTopBar(true,host)+`<aside class=playerSidebar>${playerStrip()}${state.phase==='result'?`<div class=desktopNextWrap>${state.finished?`<button class=btn id=finalResultDesktop ${host?'':'disabled'}>最終リザルトへ</button>`:`<button class=btn id=nextDesktop ${host?'':'disabled'}>次のラウンドへ</button>`}</div>`:''}</aside><main class="wrap gameBoard">${game(p,host)}</main>`;$('#leave').onclick=leaveRoom;if($('#resetLobby'))$('#resetLobby').onclick=()=>send('reset_room');bind(host,p)}
function leaveRoom(){intentionalClose=true;send('leave');room='';state=null;roomState=null;setTimeout(home,100)}
function lobby(host){let s=roomState.settings||{votes:1,endType:'round',target:5,decks:['DIXIT_1']};let decks=Object.keys(DECKS).map(k=>{let n=DECKS[k]||0,on=s.decks?.includes(k);return `<label class="deckChoice ${n?'':'disabledDeck'}"><input type=checkbox class=deckBox value="${k}" ${on?'checked':''} ${host&&n?'':'disabled'}> ${k.replace('_',' ')} <small>(${n?`${n}枚`:'未収録'})</small></label>`}).join('');return `<div class=panel><h2>ゲーム設定</h2><div class=settings><label>投票数<select id=votes ${host?'':'disabled'}><option value=1 ${s.votes==1?'selected':''}>1票</option><option value=2 ${s.votes==2?'selected':''}>2票</option></select></label><label>終了方式<select id=endType ${host?'':'disabled'}><option value=round ${s.endType==='round'?'selected':''}>ラウンド</option><option value=score ${s.endType==='score'?'selected':''}>得点</option></select></label><label>${s.endType==='round'?'ラウンド数':'目標得点'}<input id=target type=number min=1 max=999 value="${s.target}" ${host?'':'disabled'}></label></div><h3>使用デッキ</h3><div class=deckGrid>${decks}</div><p>選択中：${(s.decks||[]).join(' / ')||'なし'}　合計 ${s.cardCount||0}枚</p><p>2票制では同じカードへ2票とも投票できます。3～10人対応です。</p>${host?`<div class=cpuTest><b>テスト用CPU</b><div class=row><button class="btn secondary" id=addCpu ${roomState.players.length>=10?'disabled':''}>CPU追加</button><button class="btn secondary" id=removeCpu ${roomState.players.some(x=>x.isCpu)?'':'disabled'}>CPU削除</button></div><small>動作確認専用。後で削除する前提の機能です。</small></div><button class=btn id=start ${roomState.players.length<3?'disabled':''}>ゲーム開始</button>${roomState.players.length<3?'<p>人間＋CPUで3人以上にすると開始できます。</p>':''}`:''}</div>`}
function game(p){let h=`<div class=status>${phaseText()}</div>`;if(state.phase==='story'){if(state.storyteller===me)h+=hand(p,true)+`<div class=panel><input id=clue placeholder="お題を入力"><button class=btn id=storySubmit>お題とカードを決定</button></div>`}else if(state.phase==='submit'){h+=`<div class=panel><b>お題：</b>${esc(state.clue)}</div>`;if(state.storyteller!==me&&!p.submitted)h+=hand(p,true)}else if(state.phase==='vote'){h+=`<div class=panel><b>お題：</b>${esc(state.clue)}</div>`+board(p)}else if(state.phase==='result')h+=result();else if(state.phase==='final')h+=finalResult();return h}
function hand(p,select){return `<div class=panel><h3>手札</h3><div class=cards>${p.hand.map(id=>`<div class=card data-id="${id}"><img loading="lazy" src="${img(id)}"></div>`).join('')}</div>${select?'<button class=btn id=submitCard disabled>このカードを出す</button>':''}</div>`}
function board(p){return `<div class=panel><div class=cards>${state.board.map((c,i)=>`<div class="card voteCard" data-i="${i}"><img loading="lazy" src="${img(c.id)}"></div>`).join('')}</div><p>選択票: <b id=voteCount>${p.votes?.length||0}/${state.settings.votes}</b></p><button class=btn id=voteSubmit disabled>投票確定</button></div>`}
function result(){return `<div class="panel resultPanel"><div class="cards resultCards">${state.board.map(c=>`<div class=resultCardWrap><div class=submitter>提出者：${esc(c.owner)}${c.owner===state.storyteller?' ★語り部':''}</div><div class=card><img loading="lazy" src="${img(c.id)}"></div><div class=voters>投票者：${c.voteNames.length?c.voteNames.map(esc).join('、'):'なし'}</div></div>`).join('')}</div><div class=resultActions>${state.finished?`<button class=btn id=finalResult ${roomState.isHost?'':'disabled'}>最終リザルトへ</button>`:`<button class="btn mobileNext" id=next ${roomState.isHost?'':'disabled'}>次のラウンドへ</button>`}</div></div>`}
function finalResult(){let sorted=[...state.players].sort((a,b)=>b.score-a.score);let last=null,rank=0;let rows=sorted.map((p,i)=>{if(p.score!==last){rank=i+1;last=p.score}return `<div class=finalRow><b>${rank}位</b><span>${esc(p.name)}${p.isCpu?' 🤖':''}</span><strong>${p.score}点</strong></div>`}).join('');return `<div class="panel finalPanel"><h2>最終リザルト</h2><div class=finalList>${rows}</div>${roomState.isHost?'<button class=btn id=backLobby>ロビーに戻る</button>':'<p>ホストがロビーへ戻るまでお待ちください。</p>'}</div>`}
function phaseText(){let t={story:`${state.storyteller}がお題を決めています`,submit:'お題に合うカードを提出してください',vote:'語り部のカードに投票してください',result:'ラウンド結果',final:'最終リザルト'};return `${t[state.phase]||''}`}
function bind(host,p){
  if(!state){
    localPick={key:'',card:null,votes:[]};
    if(host){
      const update=()=>send('settings',{settings:{votes:+$('#votes').value,endType:$('#endType').value,target:+$('#target').value,decks:[...document.querySelectorAll('.deckBox:checked')].map(x=>x.value)}});
      ['votes','endType','target'].forEach(id=>$('#'+id).onchange=update);
      document.querySelectorAll('.deckBox').forEach(x=>x.onchange=update);
      if($('#addCpu')) $('#addCpu').onclick=()=>send('add_cpu');
      if($('#removeCpu')) $('#removeCpu').onclick=()=>send('remove_cpu');
      if($('#start')) $('#start').onclick=()=>send('start');
    }
    return;
  }

  const pickKey=`${room}|${state.round}|${state.phase}`;
  if(localPick.key!==pickKey) localPick={key:pickKey,card:null,votes:[]};

  if(['story','submit'].includes(state.phase)){
    let sel=localPick.card;
    if(sel && !p?.hand?.includes(sel)){sel=null;localPick.card=null}
    if(sel){
      document.querySelector(`.card[data-id="${CSS.escape(sel)}"]`)?.classList.add('selected');
      let b=$('#submitCard'); if(b)b.disabled=false;
    }
    document.querySelectorAll('.card[data-id]').forEach(c=>c.onclick=()=>{
      document.querySelectorAll('.card[data-id]').forEach(x=>x.classList.remove('selected'));
      c.classList.add('selected');
      sel=c.dataset.id;
      localPick.card=sel;
      let b=$('#submitCard'); if(b)b.disabled=false;
    });
    if($('#submitCard')) $('#submitCard').onclick=()=>{
      if(!sel) return;
      $('#submitCard').disabled=true;
      send('submit',{cardId:sel});
    };
    if($('#storySubmit')) $('#storySubmit').onclick=()=>{
      if(!sel||!$('#clue').value.trim()) return alert('カードとお題を選択してください');
      $('#storySubmit').disabled=true;
      send('story',{cardId:sel,clue:$('#clue').value.trim()});
    };
  }

  if(state.phase==='vote'&&state.storyteller!==me){
    const alreadyDone=!!p?.voteDone;
    let chosen=alreadyDone ? [...(p.votes||[])] : [...localPick.votes];
    chosen=chosen.filter(i=>Number.isInteger(i)&&state.board[i]&&state.board[i].owner!==me).slice(0,state.settings.votes);
    localPick.votes=[...chosen];

    const paintVotes=()=>{
      document.querySelectorAll('.voteCard').forEach(x=>{
        x.classList.remove('selected');
        x.removeAttribute('data-votecount');
      });
      const counts={};
      chosen.forEach(i=>counts[i]=(counts[i]||0)+1);
      Object.entries(counts).forEach(([i,n])=>{
        let el=document.querySelector(`.voteCard[data-i="${i}"]`);
        if(el){el.classList.add('selected');el.dataset.votecount=n}
      });
      if($('#voteCount')) $('#voteCount').textContent=`${chosen.length}/${state.settings.votes}`;
      if($('#voteSubmit')) $('#voteSubmit').disabled=alreadyDone||chosen.length!==state.settings.votes;
    };
    paintVotes();

    if(!alreadyDone){
      document.querySelectorAll('.voteCard').forEach(c=>c.onclick=()=>{
        let i=+c.dataset.i;
        if(state.board[i].owner===me) return alert('自分のカードには投票できません');
        if(chosen.length>=state.settings.votes) chosen.shift();
        chosen.push(i);
        localPick.votes=[...chosen];
        paintVotes();
      });
      if($('#voteSubmit')) $('#voteSubmit').onclick=()=>{
        if(chosen.length!==state.settings.votes)return;
        $('#voteSubmit').disabled=true;
        send('vote',{votes:[...chosen]});
      };
    }
  }
  if($('#next')) $('#next').onclick=()=>send('next');
  if($('#nextDesktop')) $('#nextDesktop').onclick=()=>send('next');
  if($('#finalResultDesktop')) $('#finalResultDesktop').onclick=()=>send('final_result');
  if($('#finalResult')) $('#finalResult').onclick=()=>send('final_result');
  if($('#backLobby')) $('#backLobby').onclick=()=>send('reset_room');
}
home();
