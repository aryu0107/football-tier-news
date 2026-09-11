const COUNTRY_QUERIES={
  '전체':'(football OR soccer) AND (Premier League OR La Liga OR Serie A OR Ligue 1 OR Champions League OR transfer)',
  '잉글랜드':'(football OR soccer) AND (Premier League OR Manchester United OR Manchester City OR Arsenal OR Liverpool OR Chelsea OR Tottenham)',
  '스페인':'(football OR soccer) AND (La Liga OR Real Madrid OR Barcelona OR Atletico Madrid)',
  '이탈리아':'(football OR soccer) AND (Serie A OR Juventus OR Inter Milan OR AC Milan OR Napoli)',
  '프랑스':'(football OR soccer) AND (Ligue 1 OR PSG OR Paris Saint-Germain OR Marseille OR Monaco)'
};
const LEAGUE_QUERY={'프리미어리그':'Premier League','라리가':'La Liga','세리에 A':'Serie A','리그 1':'Ligue 1'};
const SOURCE_META={
  'bbc-news':{tier:2,confidence:94},'the-athletic':{tier:2,confidence:94},'sky-sports':{tier:3,confidence:86},
  'espn':{tier:3,confidence:84},'four-four-two':{tier:3,confidence:80},'marca':{tier:4,confidence:75},
  'talksport':{tier:4,confidence:72},'football-italia':{tier:4,confidence:72},'goal':{tier:4,confidence:70}
};
const TIER_COLORS={1:'#f3c969',2:'#69d9e8',3:'#79e2ca',4:'#f0b93f',5:'#b9c4ca',6:'#b97850'};
const clean=value=>(value||'').replace(/\s+/g,' ').trim();
const inferCountry=text=>{
  const s=text.toLowerCase();
  if(/premier league|manchester|arsenal|liverpool|chelsea|tottenham|england/.test(s))return['잉글랜드','프리미어리그'];
  if(/la liga|real madrid|barcelona|atletico|spain/.test(s))return['스페인','라리가'];
  if(/serie a|juventus|inter milan|ac milan|napoli|italy/.test(s))return['이탈리아','세리에 A'];
  if(/ligue 1|paris saint-germain|\bpsg\b|marseille|monaco|france/.test(s))return['프랑스','리그 1'];
  return['전체','전체'];
};
const relativeTime=date=>{
  const diff=Math.max(0,Date.now()-new Date(date).getTime()),minute=60000,hour=3600000,day=86400000;
  if(diff<hour)return`${Math.max(1,Math.floor(diff/minute))}분 전`;
  if(diff<day)return`${Math.floor(diff/hour)}시간 전`;
  return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'short',day:'numeric'}).format(new Date(date));
};
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=3600');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const key=process.env.NEWS_API_KEY;
  if(!key)return res.status(500).json({error:'NEWS_API_KEY가 설정되지 않았습니다.'});
  const now=new Date(),oldest=new Date(now);oldest.setFullYear(now.getFullYear()-3);
  const requestedFrom=new Date(String(req.query.from||oldest.toISOString().slice(0,10))+'T00:00:00Z');
  const requestedTo=new Date(String(req.query.to||now.toISOString().slice(0,10))+'T23:59:59Z');
  const from=new Date(Math.max(oldest.getTime(),Number.isNaN(requestedFrom.getTime())?oldest.getTime():requestedFrom.getTime()));
  const to=new Date(Math.min(now.getTime(),Number.isNaN(requestedTo.getTime())?now.getTime():requestedTo.getTime()));
  const page=Math.max(1,Math.min(100,Number(req.query.page)||1));
  const pageSize=Math.max(10,Math.min(50,Number(req.query.pageSize)||20));
  const country=COUNTRY_QUERIES[req.query.country]?req.query.country:'전체';
  const league=LEAGUE_QUERY[req.query.league]?req.query.league:'전체';
  const userQuery=clean(req.query.q).slice(0,100);
  const base=league==='전체'?COUNTRY_QUERIES[country]:`(football OR soccer) AND "${LEAGUE_QUERY[league]}"`;
  const q=userQuery?`(${base}) AND (${userQuery})`:base;
  const params=new URLSearchParams({q,from:from.toISOString(),to:to.toISOString(),language:'en',sortBy:'publishedAt',page:String(page),pageSize:String(pageSize)});
  try{
    const response=await fetch(`https://newsapi.org/v2/everything?${params}`,{headers:{'X-Api-Key':key}});
    const data=await response.json();
    if(!response.ok)return res.status(response.status).json({error:data.message||'NewsAPI 요청에 실패했습니다.',code:data.code||'newsapi_error'});
    const articles=(data.articles||[]).filter(a=>a.url&&a.title&&a.title!=='[Removed]').map((a,index)=>{
      const text=`${a.title||''} ${a.description||''} ${a.content||''}`;
      let[countryName,leagueName]=inferCountry(text);
      if(country!=='전체')countryName=country;
      if(league!=='전체')leagueName=league;
      const sourceId=(a.source&&a.source.id)||'',meta=SOURCE_META[sourceId]||{tier:5,confidence:60};
      return{id:`${a.publishedAt}-${index}`,tier:meta.tier,source:(a.source&&a.source.name)||'Unknown',country:countryName,league:leagueName,time:relativeTime(a.publishedAt),publishedAt:a.publishedAt,title:clean(a.title),ko:clean(a.title),summary:clean(a.description)||'기사 설명이 제공되지 않았습니다. 원문에서 자세한 내용을 확인하세요.',tags:[leagueName==='전체'?'축구':leagueName,countryName==='전체'?'해외축구':countryName],confidence:meta.confidence,color:TIER_COLORS[meta.tier],url:a.url,image:a.urlToImage||null};
    });
    return res.status(200).json({articles,totalResults:Math.min(Number(data.totalResults)||0,5000),page,pageSize,from:from.toISOString(),to:to.toISOString(),requestedRangeYears:3});
  }catch(error){return res.status(500).json({error:'기사 서버에 연결하지 못했습니다.'});}
}
