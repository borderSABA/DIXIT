const DECKS=window.DIXIT_DECKS||{};
const $=s=>document.querySelector(s), app=$('#app');
let ws=null,state=null,roomState=null,me=localStorage.getItem('boardgame-player-name')||localStorage.getItem('boardgame_player_name')||'',room='',rooms=[],intentionalClose=false,roomTimer=null,reconnectTimer=null;
const WORKER_URL=localStorage.getItem('dixit_worker_url')||'https://dixit-online.naitoryo7110.workers.dev';
function parseCard(id){let m=id.match(/^(DIXIT_\d+)_(\d{3})$/);return m?{deck:m[1],num:m[2]}:null}
function img(id){let c=parseCard(id);return c?`cards/${c.deck}/${id}.webp`:''}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function top(){return `<div class=top><div class=brand>DIXIT ONLINE</div><div class=row><button class=btn onclick="location.href='https://bordersaba.github.io/'">HOME</button><div>v0.3.1</div></div></div>`}
async function fetchRooms(){let r=await fetch(`${WORKER_URL}/rooms`,{cache:'no-store'});let d=await r.json();if(!r.ok)throw Error(d.error||'ROOM情報を取得できません');return d.rooms||[]}
function tokenKey(id){return `dixit-online-token-${id}`}
function getToken(id){let t=localStorage.getItem(tokenKey(id));if(!t){t=crypto.randomUUID().replaceAll('-','');localStorage.setItem(tokenKey(id),t)}return t}
function statusLabel(r){return r.status==='playing'?'ゲーム中':r.status==='finished'?'終了':'待機中'}
async function home(){intentionalClose=true;if(ws){try{ws.close()}catch{}}ws=null;state=null;roomState=null;room='';clearTimeout(reconnectTimer);try{rooms=await fetchRooms()}catch(e){rooms=[]}let cards=[1,2,3,4].map(n=>{let id=`room${n}`,r=rooms.find(x=>x.id===id)||{status:'lobby',players:0,maxPlayers:10,participants:[],connectedHumans:0};let reconnect=!!localStorage.getItem(tokenKey(id))&&r.status!=='lobby';let join=r.status==='lobby'&&r.players<10;return `<div class="panel roomCard"><div class=row><h2>ROOM ${n}</h2><span class=grow></span><b>${statusLabel(r)}</b></div><div>${r.players}/${r.maxPlayers}人</div><small>参加者：${(r.participants||[]).map(esc).join('、')||'なし'}</small><button class=btn data-join="${id}" ${join||reconnect?'':'disabled'}>${reconnect?'再接続':join?'参加する':'参加不可'}</button><button class="btn secondary" data-reset="${id}" ${r.connectedHumans===0?'':'disabled'}>${r.connectedHumans===0?'初期化':'接続者あり'}</button></div>`}).join('');app.innerHTML=top()+`<div class="wrap onlineHome"><div class=panel><h2>プレイヤー名</h2><input id=name value="${esc(me)}" maxlength=18 placeholder="名前を入力"></div><div class=rooms>${cards}</div></div>`;document.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>connectRoom(b.dataset.join));document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>resetRoom(b.dataset.reset));clearTimeout(roomTimer);roomTimer=setTimeout(()=>{if(!room)home()},2500)}
function save(){me=$('#name')?.value.trim()||me;if(!me)return false;localStorage.setItem('boardgame-player-name',me);localStorage.setItem('boardgame_player_name',me);return true}
async function resetRoom(id){if(!confirm(`${id.replace('room','ROOM ')} を初期化しますか？`))return;let r=await fetch(`${WORKER_URL}/rooms/${id}/reset-empty`,{method:'POST'}),d=await r.json();if(!r.ok)return alert(d.error||'初期化できません');home()}
async function connectRoom(id){if(!save())return alert('名前を入力してください');clearTimeout(roomTimer);room=id;intentionalClose=false;let token=getToken(id);let chk=await fetch(`${WORKER_URL}/rooms/${id}/join-check?token=${encodeURIComponent(token)}&name=${encodeURIComponent(me)}`),info=await chk.json();if(!chk.ok){room='';return alert(info.error)}let url=WORKER_URL.replace(/^http/,'ws')+`/ws/${id}?token=${encodeURIComponent(token)}&name=${encodeURIComponent(me)}`;ws=new WebSocket(url);ws.onopen=()=>{};ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.type==='state'){roomState=m.room;state=m.game;render()}else if(m.type==='error')alert(m.message)};ws.onclose=()=>{if(!intentionalClose&&room){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>connectRoom(room),1500)}}}
function send(type,data={}){if(ws?.readyState===1)ws.send(JSON.stringify({type,...data}))}
function render(){if(!roomState)return;let host=roomState.isHost;if(!state){app.innerHTML=top()+`<div class=wrap><div class=panel><div class=row><b>${esc(roomState.roomName)}</b><span class=grow></span><button class="btn secondary" id=leave>退出</button></div><div class=players>${roomState.players.map(x=>`<span class=pill>${esc(x.name)}${x.isHost?' 👑':''}${x.connected?'':' (切断)'}</span>`).join('')}</div></div>${lobby(host)}</div>`;$('#leave').onclick=leaveRoom;bind(host,null);return}let p=state.players.find(x=>x.name===me);app.innerHTML=top()+`<div class=wrap><div class=panel><div class=row><b>${esc(roomState.roomName)}</b><span class=grow></span><button class="btn secondary" id=leave>退出</button>${host?'<button class="btn secondary" id=resetLobby>ロビーへ戻す</button>':''}</div><div class=players>${roomState.players.map(x=>`<span class=pill>${esc(x.name)}${x.isHost?' 👑':''}${x.connected?'':' (切断)'}</span>`).join('')}</div></div>${game(p,host)}</div>`;$('#leave').onclick=leaveRoom;if($('#resetLobby'))$('#resetLobby').onclick=()=>send('reset_room');bind(host,p)}
function leaveRoom(){intentionalClose=true;send('leave');room='';state=null;roomState=null;setTimeout(home,100)}
function lobby(host){let s=roomState.settings||{votes:1,endType:'round',target:5,decks:['DIXIT_1']};let decks=Object.keys(DECKS).map(k=>{let n=DECKS[k]||0,on=s.decks?.includes(k);return `<label class="deckChoice ${n?'':'disabledDeck'}"><input type=checkbox class=deckBox value="${k}" ${on?'checked':''} ${host&&n?'':'disabled'}> ${k.replace('_',' ')} <small>(${n?`${n}枚`:'未収録'})</small></label>`}).join('');return `<div class=panel><h2>ゲーム設定</h2><div class=settings><label>投票数<select id=votes ${host?'':'disabled'}><option value=1 ${s.votes==1?'selected':''}>1票</option><option value=2 ${s.votes==2?'selected':''}>2票</option></select></label><label>終了方式<select id=endType ${host?'':'disabled'}><option value=round ${s.endType==='round'?'selected':''}>ラウンド</option><option value=score ${s.endType==='score'?'selected':''}>得点</option></select></label><label>${s.endType==='round'?'ラウンド数':'目標得点'}<input id=target type=number min=1 max=999 value="${s.target}" ${host?'':'disabled'}></label></div><h3>使用デッキ</h3><div class=deckGrid>${decks}</div><p>選択中：${(s.decks||[]).join(' / ')||'なし'}　合計 ${s.cardCount||0}枚</p><p>2票制では同じカードへ2票とも投票できます。3～10人対応です。</p>${host?`<button class=btn id=start ${roomState.players.length<3?'disabled':''}>ゲーム開始</button>${roomState.players.length<3?'<p>3人以上で開始できます。</p>':''}`:''}</div>`}
function game(p){let h=`<div class=panel><div class=score>${state.players.map(x=>`<div><b>${esc(x.name)}</b><br>${x.score}点</div>`).join('')}</div></div><div class=status>${phaseText()}</div>`;if(state.phase==='story'){if(state.storyteller===me)h+=hand(p,true)+`<div class=panel><input id=clue placeholder="お題を入力"><button class=btn id=storySubmit>お題とカードを決定</button></div>`}else if(state.phase==='submit'){h+=`<div class=panel><b>お題：</b>${esc(state.clue)}</div>`;if(state.storyteller!==me&&!p.submitted)h+=hand(p,true)}else if(state.phase==='vote'){h+=`<div class=panel><b>お題：</b>${esc(state.clue)}</div>`+board(p)}else if(state.phase==='result')h+=result();return h}
function hand(p,select){return `<div class=panel><h3>手札</h3><div class=cards>${p.hand.map(id=>`<div class=card data-id="${id}"><img loading="lazy" src="${img(id)}"></div>`).join('')}</div>${select?'<button class=btn id=submitCard disabled>このカードを出す</button>':''}</div>`}
function board(p){return `<div class=panel><div class=cards>${state.board.map((c,i)=>`<div class="card voteCard" data-i="${i}"><span class=num>${i+1}</span><img loading="lazy" src="${img(c.id)}"></div>`).join('')}</div><p>選択票: <b id=voteCount>${p.votes?.length||0}/${state.settings.votes}</b></p><button class=btn id=voteSubmit disabled>投票確定</button></div>`}
function result(){return `<div class=panel><h2>答え合わせ</h2><div class=cards>${state.board.map((c,i)=>`<div class=card><span class=num>${i+1} ${c.owner===state.storyteller?'★正解':''}</span><img loading="lazy" src="${img(c.id)}"><div style="padding:7px">${esc(c.owner)} / ${c.voteNames.map(esc).join(', ')||'0票'}</div></div>`).join('')}</div><h3>今回の得点</h3>${state.players.map(x=>`<p>${esc(x.name)} +${x.roundGain||0}（計${x.score}）</p>`).join('')}${state.finished?'<h2>ゲーム終了</h2>':`<button class=btn id=next ${roomState.isHost?'':'disabled'}>次のラウンド</button>`}</div>`}
function phaseText(){let t={story:`${state.storyteller}がお題を決めています`,submit:'お題に合うカードを提出してください',vote:'語り部のカードに投票してください',result:'ラウンド結果'};return `ラウンド ${state.round}　${t[state.phase]||''}`}
function bind(host,p){
  if(!state){
    if(host){
    const update=()=>send('settings',{settings:{votes:+$('#votes').value,endType:$('#endType').value,target:+$('#target').value,decks:[...document.querySelectorAll('.deckBox:checked')].map(x=>x.value)}});
    ['votes','endType','target'].forEach(id=>$('#'+id).onchange=update);
    document.querySelectorAll('.deckBox').forEach(x=>x.onchange=update);
      if($('#start')) $('#start').onclick=()=>send('start');
    }
    return;
  }

  let sel=null;
  if(['story','submit'].includes(state.phase)){
    document.querySelectorAll('.card[data-id]').forEach(c=>c.onclick=()=>{
      document.querySelectorAll('.card').forEach(x=>x.classList.remove('selected'));
      c.classList.add('selected');
      sel=c.dataset.id;
      let b=$('#submitCard');
      if(b)b.disabled=false;
    });
    if($('#submitCard')) $('#submitCard').onclick=()=>send('submit',{cardId:sel});
    if($('#storySubmit')) $('#storySubmit').onclick=()=>{
      if(!sel||!$('#clue').value.trim()) return alert('カードとお題を選択してください');
      send('story',{cardId:sel,clue:$('#clue').value.trim()});
    };
  }

  if(state.phase==='vote'&&state.storyteller!==me){
    let chosen=[];
    document.querySelectorAll('.voteCard').forEach(c=>c.onclick=()=>{
      let i=+c.dataset.i;
      if(state.board[i].owner===me) return alert('自分のカードには投票できません');
      if(chosen.length>=state.settings.votes) chosen.shift();
      chosen.push(i);
      document.querySelectorAll('.voteCard').forEach(x=>x.classList.remove('selected'));
      [...new Set(chosen)].forEach(j=>document.querySelector(`.voteCard[data-i="${j}"]`)?.classList.add('selected'));
      p.votes=chosen;
      $('#voteCount').textContent=`${chosen.length}/${state.settings.votes}`;
      $('#voteSubmit').disabled=chosen.length!==state.settings.votes;
    });
    $('#voteSubmit').onclick=()=>send('vote',{votes:chosen});
  }
  if($('#next')) $('#next').onclick=()=>send('next');
}
home();
