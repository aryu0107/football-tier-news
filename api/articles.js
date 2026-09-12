const COUNTRY_QUERIES={
  '전체':'(football OR soccer) AND (Premier League OR La Liga OR Serie A OR Ligue 1 OR Champions League OR transfer)',
  '잉글랜드':'(football OR soccer) AND (Premier League OR Manchester United OR Manchester City OR Arsenal OR Liverpool OR Chelsea OR Tottenham)',
  '스페인':'(football OR soccer) AND (La Liga OR Real Madrid OR Barcelona OR Atletico Madrid)',
  '이탈리아':'(football OR soccer) AND (Serie A OR Juventus OR Inter Milan OR AC Milan OR Napoli)',
  '프랑스':'(football OR soccer) AND (Ligue 1 OR PSG OR Paris Saint-Germain OR Marseille OR Monaco)'
};
const LEAGUE_QUERY={'프리미어리그':'Premier League','라리가':'La Liga','세리에 A':'Serie A','리그 1':'Ligue 1'};
const TIER_COLORS={1:'#f3c969',2:'#69d9e8',3:'#f0b93f',4:'#b97850'};
// 팬 커뮤니티의 2025~2026 신뢰도 가이드들을 종합한 보수적 기준입니다.
// 티어는 절대적 사실 판정이 아니며, 기자의 전문 구단/국가와 기사 맥락에 따라 달라집니다.
const JOURNALIST_RULES=[
 {tier:1,confidence:98,names:['david ornstein','paul joyce','simon stone','james pearce','arancha rodriguez','melchor ruiz','josé luis sánchez','jose luis sanchez','romeo agresti','antonio vitiello','fabrizio biasin','mohamed bouhafsi']},
 {tier:2,confidence:92,names:['fabrizio romano','matteo moretto','fabrice hawkins','sami mokbel','nizaar kinsella','matt law','alasdair gold','john percy','florian plettenberg','gianluca di marzio','alfredo pedullà','alfredo pedulla','loïc tanzi','loic tanzi','hugo guillemet','josé barroso','jose barroso','santi aouna']},
 {tier:2,confidence:82,names:['gerard romero','ben jacobs','christian falk','sam wallace','dominic king','chris bascombe','david hytner','phil mcnulty','nicolò schira','nicolo schira','luca bianchin']},
 {tier:4,confidence:25,names:['tancredi palmeri','indykaila','rudy galetti']}
];
const SOURCE_RULES=[
 {tier:1,confidence:99,names:['official club','club official','fc.com','united.com','arsenal.com','chelseafc.com','liverpoolfc.com','mancity.com','realmadrid.com','fcbarcelona.com','juventus.com','inter.it','acmilan.com','psg.fr']},
 {tier:2,confidence:93,names:['bbc sport','bbc news','the athletic','the times']},
 {tier:2,confidence:84,names:['sky sports','sky sport italia','the guardian','the telegraph','rmc sport','cope','catalunya radio','rac1','relevo']},
 {tier:3,confidence:72,names:['marca','l’equipe',"l'equipe",'le parisien','la gazzetta dello sport','gazzetta dello sport','corriere della sera','la repubblica','espn','goal.com','goal','talksport','mundo deportivo','football italia','independent']},
 {tier:3,confidence:52,names:['as.com','diario as','calciomercato','tuttomercatoweb','corriere dello sport','daily mail','the mirror','express','90min','caughtoffside','teamtalk','football insider','bleacher report','metro.co.uk','sport.es']},
 {tier:4,confidence:25,names:['the sun','daily star','tuttosport','el chiringuito','don balon','diario gol','squawka','ladbible']}
];
const clean=value=>(value||'').replace(/\s+/g,' ').trim();
const normalize=value=>clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const findRule=(haystack,rules)=>{const s=normalize(haystack);for(const rule of rules){const matched=rule.names.find(name=>s.includes(normalize(name)));if(matched)return{...rule,matched};}return null};
const isOfficialArticle=(source,url,title)=>{const s=normalize(`${source} ${url} ${title}`);return /\b(official|announces|confirmed|signs|contract extension)\b/.test(s)&&/mancity\.com|manutd\.com|arsenal\.com|chelseafc\.com|liverpoolfc\.com|realmadrid\.com|fcbarcelona\.com|juventus\.com|inter\.it|acmilan\.com|psg\.fr/.test(s)};
const classifyReliability=article=>{
 const authorRule=findRule(article.author||'',JOURNALIST_RULES);
 if(authorRule)return{...authorRule,basis:`기자 기준 · ${clean(article.author)}`};
 if(isOfficialArticle(article.source?.name||'',article.url||'',article.title||''))return{tier:1,confidence:99,basis:'구단 공식 채널'};
 const sourceRule=findRule(`${article.source?.name||''} ${article.url||''}`,SOURCE_RULES);
 if(sourceRule)return{...sourceRule,basis:`매체 기준 · ${article.source?.name||'Unknown'}`};
 return{tier:3,confidence:55,basis:'미등록 매체 · 추가 검증 필요'};
};
const inferCountry=text=>{
 const s=normalize(text);
 if(/premier league|manchester|arsenal|liverpool|chelsea|tottenham|england/.test(s))return['잉글랜드','프리미어리그'];
 if(/la liga|real madrid|barcelona|atletico|spain/.test(s))return['스페인','라리가'];
 if(/serie a|juventus|inter milan|ac milan|napoli|italy/.test(s))return['이탈리아','세리에 A'];
 if(/ligue 1|paris saint-germain|\bpsg\b|marseille|monaco|france/.test(s))return['프랑스','리그 1'];
 return['전체','전체'];
};
const relativeTime=date=>{const diff=Math.max(0,Date.now()-new Date(date).getTime()),minute=60000,hour=3600000,day=86400000;if(diff<hour)return`${Math.max(1,Math.floor(diff/minute))}분 전`;if(diff<day)return`${Math.floor(diff/hour)}시간 전`;return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'short',day:'numeric'}).format(new Date(date))};
const parseGeminiJson=text=>{const raw=clean(text).replace(/^```json\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(raw)}catch{const match=raw.match(/\[[\s\S]*\]/);return match?JSON.parse(match[0]):[]}};
const localizeArticles=async articles=>{
 const key=process.env.GEMINI_API_KEY;if(!key)return articles.map(a=>({...a,translationStatus:'unavailable'}));
 const payload=articles.map((a,index)=>({index,title:a.title,description:a.summary,content:a.rawContent,author:a.author,source:a.source}));
 const prompt=`당신은 해외 축구 뉴스 전문 한국어 편집자입니다. 아래 기사 배열을 한국어로 번역·요약하세요.\n\n반드시 지킬 규칙:\n1. 입력과 같은 개수 및 index를 유지한 JSON 배열만 출력합니다. 마크다운을 쓰지 마세요.\n2. 각 항목 형식은 {"index":0,"koTitle":"...","detailedSummary":"...","entities":["..."]} 입니다.\n3. koTitle은 자연스러운 한국어 기사 제목으로 번역하되 선수, 감독, 기자, 구단, 대회 이름을 빠뜨리지 마세요.\n4. detailedSummary는 입력에 실제로 있는 정보만 사용해 한국어 3~5문장, 약 180~350자로 작성하세요. 인물 이름, 소속·관심 구단, 이적/계약/경기 상황, 핵심 수치·날짜가 제공되었다면 반드시 포함하세요. 정보가 부족하면 추측하지 말고 부족하다고 명시하세요.\n5. 고유명사는 널리 쓰이는 한국어 표기를 사용하고 첫 등장에 필요하면 원어를 괄호로 병기하세요.\n6. entities에는 기사에 명시된 핵심 인물·구단·대회명을 최대 8개 넣으세요.\n\n기사 배열:\n${JSON.stringify(payload)}`;
 try{
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.15,responseMimeType:'application/json'}})});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Gemini request failed');
  const localized=parseGeminiJson(data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'');
  const byIndex=new Map(localized.map(item=>[Number(item.index),item]));
  return articles.map((article,index)=>{const item=byIndex.get(index);return item?{...article,ko:clean(item.koTitle)||article.title,summary:clean(item.detailedSummary)||article.summary,entities:Array.isArray(item.entities)?item.entities.map(clean).filter(Boolean).slice(0,8):[],translationStatus:'translated'}:{...article,translationStatus:'fallback'}});
 }catch{return articles.map(a=>({...a,translationStatus:'fallback'}))}
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const key=process.env.NEWS_API_KEY;if(!key)return res.status(500).json({error:'NEWS_API_KEY가 설정되지 않았습니다.'});
 const now=new Date(),defaultFrom=new Date(now);defaultFrom.setDate(now.getDate()-6);
 const requestedFrom=new Date(String(req.query.from||defaultFrom.toISOString().slice(0,10))+'T00:00:00Z'),requestedTo=new Date(String(req.query.to||now.toISOString().slice(0,10))+'T23:59:59Z');
 const from=Number.isNaN(requestedFrom.getTime())?defaultFrom:requestedFrom,to=new Date(Math.min(now.getTime(),Number.isNaN(requestedTo.getTime())?now.getTime():requestedTo.getTime()));
 const rangeDays=Math.floor((to.getTime()-from.getTime())/86400000)+1;
 if(from>to)return res.status(400).json({error:'시작일은 종료일보다 늦을 수 없습니다.',code:'invalid_date_range'});
 if(rangeDays>31)return res.status(400).json({error:'기사량이 너무 많습니다. 날짜 범위는 최대 31일까지 선택할 수 있습니다.',code:'date_range_too_large',maxRangeDays:31});
 const page=Math.max(1,Math.min(100,Number(req.query.page)||1)),pageSize=Math.max(10,Math.min(50,Number(req.query.pageSize)||10));
 const country=COUNTRY_QUERIES[req.query.country]?req.query.country:'전체',league=LEAGUE_QUERY[req.query.league]?req.query.league:'전체',userQuery=clean(req.query.q).slice(0,100);
 const base=league==='전체'?COUNTRY_QUERIES[country]:`(football OR soccer) AND "${LEAGUE_QUERY[league]}"`,q=userQuery?`(${base}) AND (${userQuery})`:base;
 const params=new URLSearchParams({q,from:from.toISOString(),to:to.toISOString(),language:'en',sortBy:'publishedAt',page:String(page),pageSize:String(pageSize)});
 try{
  const response=await fetch(`https://newsapi.org/v2/everything?${params}`,{headers:{'X-Api-Key':key}}),data=await response.json();
  if(!response.ok)return res.status(response.status).json({error:data.message||'NewsAPI 요청에 실패했습니다.',code:data.code||'newsapi_error'});
  const articles=(data.articles||[]).filter(a=>a.url&&a.title&&a.title!=='[Removed]').map((a,index)=>{
   const text=`${a.title||''} ${a.description||''} ${a.content||''}`;let[countryName,leagueName]=inferCountry(text);if(country!=='전체')countryName=country;if(league!=='전체')leagueName=league;
   const meta=classifyReliability(a),source=(a.source&&a.source.name)||'Unknown',author=clean(a.author);
   return{id:`${a.publishedAt}-${index}`,tier:meta.tier,source,author,country:countryName,league:leagueName,time:relativeTime(a.publishedAt),publishedAt:a.publishedAt,title:clean(a.title),ko:clean(a.title),summary:clean(a.description)||'기사 설명이 충분히 제공되지 않았습니다. 원문에서 자세한 내용을 확인하세요.',rawContent:clean(a.content),tags:[leagueName==='전체'?'축구':leagueName,author||countryName==='전체'?'해외축구':countryName].filter(Boolean),confidence:meta.confidence,tierBasis:meta.basis,color:TIER_COLORS[meta.tier],url:a.url,image:a.urlToImage||null};
  });
  const localizedArticles=await localizeArticles(articles);
  const safeArticles=localizedArticles.map(({rawContent,...article})=>article);
  return res.status(200).json({articles:safeArticles,totalResults:Math.min(Number(data.totalResults)||0,5000),page,pageSize,from:from.toISOString(),to:to.toISOString(),maxRangeDays:31,tierModel:'community-consensus-2026-09',translationModel:'gemini-3.6-flash'});
 }catch(error){return res.status(500).json({error:'기사 서버에 연결하지 못했습니다.'});}
}
